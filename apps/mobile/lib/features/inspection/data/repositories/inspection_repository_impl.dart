import 'dart:async';
import 'dart:typed_data';

import 'package:dartz/dartz.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/offline/sync_op.dart';
import '../../../../core/offline/sync_worker.dart';
import '../../domain/entities/inspection_entity.dart';
import '../../domain/entities/photo_entity.dart';
import '../../domain/repositories/inspection_repository.dart';
import '../datasources/inspection_local_datasource.dart';
import '../datasources/inspection_remote_datasource.dart';
import '../datasources/photo_local_datasource.dart';

/// Local-first repository. Form fields and photos go to Hive + the
/// app documents directory immediately; server writes are queued
/// behind the [SyncWorker] when offline.
///
/// All sync handlers (form patches, photo uploads, tag updates, photo
/// deletes) are registered in this constructor — keeping them next to
/// the feature's repo means the worker stays domain-agnostic and we
/// never have to remember to wire them up somewhere else.
class InspectionRepositoryImpl implements InspectionRepository {
  final InspectionRemoteDatasource remote;
  final InspectionLocalDatasource local;
  final PhotoLocalDatasource photos;
  final SyncWorker syncWorker;
  final Uuid _uuid;

  /// Pulse fires after a photo's local state changes (capture, upload
  /// drained, tag patch, delete). [watchPhotos] listens to this and
  /// re-runs its merge so the UI sees newly-captured offline photos
  /// without waiting for a server roundtrip.
  final StreamController<String> _photoLocalChanges =
      StreamController<String>.broadcast();

  InspectionRepositoryImpl({
    required this.remote,
    required this.local,
    required this.photos,
    required this.syncWorker,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid() {
    // ── Inspection create: when the rufero arrives at an appointment
    //    offline for the first time, we generate a local UUID + stub
    //    so the form / photo paths have a stable id to write against.
    //    On drain, push that same id to the server so any subsequent
    //    queued ops still find the right row.
    syncWorker.registerHandler(
      SyncOpKind.inspectionCreate,
      (op) async {
        final inspectionId = op.payload['inspection_id'] as String;
        final appointmentId = op.payload['appointment_id'] as String;
        final prospectId = op.payload['prospect_id'] as String;
        final draft = await local.getById(inspectionId);
        if (draft == null) return;
        // getOrCreate is idempotent server-side: if a row already
        // exists for this appointment, the server returns it (with
        // whatever id it has). Surface that as the canonical row.
        final saved = await remote.getOrCreateForAppointment(
          appointmentId: appointmentId,
          prospectId: prospectId,
          id: inspectionId,
        );
        await local.save(saved, dirty: await local.isDirty(inspectionId));
      },
    );

    // ── Form patch: replay the latest Hive draft. Idempotent — running
    //    it twice is a no-op since the server takes the most recent
    //    values either way.
    syncWorker.registerHandler(
      SyncOpKind.inspectionFormPatch,
      (op) async {
        final inspectionId = op.payload['inspection_id'] as String;
        final draft = await local.getById(inspectionId);
        if (draft == null) return;
        final isDirty = await local.isDirty(inspectionId);
        if (!isDirty) return;
        final updated = await remote.saveDamageForm(
          inspectionId: inspectionId,
          form: DamageFormData.fromInspection(draft),
        );
        await local.save(updated, dirty: false);
      },
    );

    // ── Photo upload: read bytes + metadata from the local store,
    //    push to Storage + DB. After success, swap the local record
    //    to "uploaded" so the next merge no longer treats it as
    //    pending. Bytes stay on disk — pruning is a follow-up
    //    housekeeping step (we'd rather keep them around for offline
    //    re-view than aggressively delete).
    syncWorker.registerHandler(
      SyncOpKind.photoUpload,
      (op) async {
        final photoId = op.payload['photo_id'] as String;
        final record = await photos.getEntity(photoId);
        if (record == null) return; // user deleted it before drain
        if (record.isUploaded) return; // racing drain — already done
        final bytes = await photos.readBytes(photoId);
        if (bytes == null) {
          // File lost — drop the queued upload so we don't keep
          // retrying. Local Hive row is also nuked so the UI no
          // longer shows it.
          await photos.delete(photoId);
          _photoLocalChanges.add(record.inspectionId ?? '');
          return;
        }
        final inspectionId = record.inspectionId;
        if (inspectionId == null) return;
        final uploaded = await remote.uploadPhoto(
          inspectionId: inspectionId,
          prospectId: record.prospectId,
          bytes: bytes,
          tags: record.tags,
          gpsLat: record.gpsLat,
          gpsLng: record.gpsLng,
          widthPx: record.widthPx,
          heightPx: record.heightPx,
        );
        await photos.markUploaded(
          photoId: photoId,
          serverStoragePath: uploaded.storagePath,
          uploadedAt: uploaded.uploadedAt ?? DateTime.now(),
        );
        _photoLocalChanges.add(inspectionId);
      },
    );

    // ── Tag update on an already-uploaded photo. For not-yet-uploaded
    //    photos we don't enqueue — the latest tags ride along on the
    //    eventual upload op.
    syncWorker.registerHandler(
      SyncOpKind.photoTagUpdate,
      (op) async {
        final photoId = op.payload['photo_id'] as String;
        final tags = (op.payload['tags'] as List).cast<String>();
        await remote.updatePhotoTags(photoId: photoId, tags: tags);
      },
    );

    // ── Photo delete on an already-uploaded photo. For local-only
    //    photos we cancel the pending upload instead of queueing a
    //    delete (nothing on the server to remove).
    syncWorker.registerHandler(
      SyncOpKind.photoDelete,
      (op) async {
        final photoId = op.payload['photo_id'] as String;
        await remote.deletePhoto(photoId);
      },
    );
  }

  @override
  Future<Either<Failure, InspectionEntity>> getOrCreateForAppointment({
    required String appointmentId,
    required String prospectId,
  }) async {
    // Online path: ask the server, then cache it for the offline path.
    try {
      final i = await remote.getOrCreateForAppointment(
        appointmentId: appointmentId,
        prospectId: prospectId,
      );
      // Don't clobber a dirty local draft. If the user typed while
      // offline and we're just coming back, our local has the newer
      // form; the sync worker will push it on its own.
      final existing = await local.getById(i.id);
      if (existing == null || !(await local.isDirty(i.id))) {
        await local.save(i, dirty: false);
      }
      return Right(i);
    } on NetworkException catch (_) {
      // Offline. Two paths:
      //   1. We've loaded this inspection online before — local has
      //      a cached row, return it and let the user continue.
      //   2. First visit while offline — stub a draft locally with
      //      a client-side UUID + queue an `inspection_create` op
      //      so the rufero can take photos / fill the form right
      //      now and we'll catch up on the server when reconnected.
      final cached = await local.findByAppointmentId(appointmentId);
      if (cached != null) return Right(cached);

      final localId = _uuid.v4();
      final now = DateTime.now();
      final stub = InspectionEntity(
        id: localId,
        // tenant_id is filled in by the server on drain; leave blank
        // locally so the field is unambiguous.
        tenantId: '',
        prospectId: prospectId,
        appointmentId: appointmentId,
        // rufero_id is the authenticated user — we don't have it in
        // the repo without pulling Supabase in. Server will overwrite
        // with `auth.uid()` on insert, so blank here is fine.
        ruferoId: '',
        createdAt: now,
        updatedAt: now,
      );
      await local.save(stub, dirty: false);
      await syncWorker.enqueue(
        kind: SyncOpKind.inspectionCreate,
        payload: {
          'inspection_id': localId,
          'appointment_id': appointmentId,
          'prospect_id': prospectId,
        },
        dedupKey: appointmentId,
      );
      return Right(stub);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, AdHocInspectionStart>> startAdHocInspection({
    required String prospectId,
  }) async {
    try {
      final r = await remote.startAdHocInspection(prospectId: prospectId);
      return Right(
        AdHocInspectionStart(
          appointmentId: r.appointmentId,
          inspectionId: r.inspectionId,
        ),
      );
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, InspectionEntity>> saveDamageForm({
    required String inspectionId,
    required DamageFormData form,
  }) async {
    // 1. Write the latest values to Hive immediately so the UI never
    //    races with the server response.
    final existing = await local.getById(inspectionId);
    if (existing == null) {
      // Nothing cached — we need the server to have created the row
      // first (via getOrCreateForAppointment). Surface this as a hard
      // failure rather than fabricating an entity.
      return const Left(ServerFailure(
        'No local inspection draft. Reopen the inspection to retry.',
      ));
    }
    final merged = existing.copyWith(
      roofAgeYears: form.roofAgeYears,
      roofMaterial: form.roofMaterial,
      stormDate: form.stormDate,
      affectedAreas: form.affectedAreas,
      severity: form.severity,
      scopeNotes: form.notes,
      updatedAt: DateTime.now(),
    );

    // 2. Try the server. On success, persist with dirty=false.
    try {
      final saved =
          await remote.saveDamageForm(inspectionId: inspectionId, form: form);
      await local.save(saved, dirty: false);
      return Right(saved);
    } on NetworkException catch (_) {
      // 3. Offline — keep the merged draft, mark dirty, enqueue.
      //    dedupKey makes 100 keystrokes coalesce into 1 server write.
      await local.save(merged, dirty: true);
      await syncWorker.enqueue(
        kind: SyncOpKind.inspectionFormPatch,
        payload: {'inspection_id': inspectionId},
        dedupKey: inspectionId,
      );
      return Right(merged);
    } on ServerException catch (e) {
      // Server reachable but rejected the write — don't queue, surface.
      await local.save(merged, dirty: true);
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, InspectionEntity>> markComplete(String inspectionId) async {
    try {
      final i = await remote.markComplete(inspectionId);
      await local.save(i, dirty: false);
      return Right(i);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<PhotoEntity>>> getPhotos(String inspectionId) async {
    // Server-side first; merge in local-only (un-uploaded) photos so
    // the caller sees the complete inspection.
    final pending = await photos.pendingFor(inspectionId);
    try {
      final remoteList = await remote.fetchPhotos(inspectionId);
      return Right(_merge(remoteList, pending));
    } on NetworkException catch (_) {
      // Offline — return just the local set, so a rufero who took
      // photos this morning still sees them on this screen.
      return Right(pending);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<PhotoEntity>> watchPhotos(String inspectionId) {
    // The underlying remote stream pulls fresh photos on every change.
    // We layer two extra triggers on top: an initial pull (in case
    // there's no server stream yet) and pulses from `_photoLocalChanges`
    // so a brand-new local-only photo shows up the instant it lands on
    // disk — no waiting for a server roundtrip.
    final controller = StreamController<List<PhotoEntity>>();

    Future<void> emit() async {
      if (controller.isClosed) return;
      final pending = await photos.pendingFor(inspectionId);
      try {
        final remoteList = await remote.fetchPhotos(inspectionId);
        controller.add(_merge(remoteList, pending));
      } catch (_) {
        // Offline / transient — UI still gets the local set.
        controller.add(pending);
      }
    }

    // Kick off + remote-side change stream.
    emit();
    final remoteSub = remote.watchPhotos(inspectionId).listen(
          (_) => emit(),
          onError: (_) => emit(),
        );
    final localSub = _photoLocalChanges.stream
        .where((id) => id == inspectionId || id.isEmpty)
        .listen((_) => emit());

    controller.onCancel = () async {
      await remoteSub.cancel();
      await localSub.cancel();
    };
    return controller.stream;
  }

  @override
  Future<Either<Failure, PhotoEntity>> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  }) async {
    // 1. Always: generate a stable id, write bytes to disk, persist
    //    metadata in Hive. From this point the photo exists locally
    //    no matter what the network does.
    final draft = await local.getById(inspectionId);
    final tenantId = draft?.tenantId ?? '';
    final photoId = _uuid.v4();
    final pending = await photos.savePending(
      photoId: photoId,
      tenantId: tenantId,
      inspectionId: inspectionId,
      prospectId: prospectId,
      bytes: bytes,
      tags: tags,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      widthPx: widthPx,
      heightPx: heightPx,
    );
    _photoLocalChanges.add(inspectionId);

    // 2. Enqueue an upload op. dedupKey keeps re-uploads of the same
    //    photoId from stacking if something weird happens.
    await syncWorker.enqueue(
      kind: SyncOpKind.photoUpload,
      payload: {'photo_id': photoId},
      dedupKey: photoId,
    );

    // The worker drains in the background; if we're online, the drain
    // typically completes before the UI even rebuilds. Return the
    // local snapshot either way — `watchPhotos` will swap it with the
    // server-side row once the upload finishes.
    return Right(pending);
  }

  @override
  Future<Either<Failure, Unit>> deletePhoto(String photoId) async {
    // Two cases:
    //   a) Local-only (never uploaded) — nuke locally + cancel the
    //      pending upload op. Nothing to tell the server about.
    //   b) Uploaded — try remote first; on offline, enqueue a delete
    //      op and nuke locally so the UI updates right away.
    final entity = await photos.getEntity(photoId);
    final isUploaded = entity?.isUploaded ?? false;
    final inspectionId = entity?.inspectionId ?? '';

    if (!isUploaded) {
      await syncWorker.cancelPending(
        kind: SyncOpKind.photoUpload,
        dedupKey: photoId,
      );
      await photos.delete(photoId);
      _photoLocalChanges.add(inspectionId);
      return const Right(unit);
    }

    try {
      await remote.deletePhoto(photoId);
      await photos.delete(photoId);
      _photoLocalChanges.add(inspectionId);
      return const Right(unit);
    } on NetworkException catch (_) {
      await syncWorker.enqueue(
        kind: SyncOpKind.photoDelete,
        payload: {'photo_id': photoId},
        dedupKey: photoId,
      );
      await photos.delete(photoId);
      _photoLocalChanges.add(inspectionId);
      return const Right(unit);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, PhotoEntity>> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  }) async {
    final entity = await photos.getEntity(photoId);
    final isUploaded = entity?.isUploaded ?? false;

    // Always write tags locally — this is what `watchPhotos` reads back
    // and what a future upload op will send to the server.
    await photos.updateTags(photoId, tags);
    _photoLocalChanges.add(entity?.inspectionId ?? '');

    if (!isUploaded) {
      // Local-only photo: nothing to sync. The eventual upload op
      // pulls the latest tags from the local record.
      return Right(
        (await photos.getEntity(photoId)) ?? entity!,
      );
    }

    try {
      final p = await remote.updatePhotoTags(photoId: photoId, tags: tags);
      return Right(p);
    } on NetworkException catch (_) {
      await syncWorker.enqueue(
        kind: SyncOpKind.photoTagUpdate,
        payload: {'photo_id': photoId, 'tags': tags},
        dedupKey: photoId,
      );
      return Right(
        (await photos.getEntity(photoId)) ?? entity!,
      );
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, String>> getPhotoSignedUrl(String storagePath) async {
    // Local-only photos arrive with `file://` URIs — return as-is so
    // the consumer can `Image.file` them straight from disk. Server
    // paths go through the usual signed-URL fetch.
    if (storagePath.startsWith('file://')) {
      return Right(storagePath);
    }
    try {
      final url = await remote.getPhotoSignedUrl(storagePath);
      return Right(url);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  /// Merge a server-side list of photos with locally-pending ones,
  /// de-duping by id. Server wins if both sides claim the same row
  /// (e.g. a freshly-drained upload).
  List<PhotoEntity> _merge(
    List<PhotoEntity> remote,
    List<PhotoEntity> pending,
  ) {
    final seen = <String>{for (final p in remote) p.id};
    final extras = pending.where((p) => !seen.contains(p.id));
    return [...remote, ...extras]
      ..sort((a, b) => a.takenAt.compareTo(b.takenAt));
  }

  @override
  Future<Either<Failure, List<InspectionEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      // Cache each server-side row so the next offline read serves
      // the same data. Don't clobber dirty drafts — the user has
      // unpushed edits we don't want to overwrite with stale server
      // values mid-stream.
      for (final i in list) {
        if (!(await local.isDirty(i.id))) {
          await local.save(i, dirty: false);
        }
      }
      // Read back through the cache so any offline-only stubs the
      // rufero started (queued inspection_create not yet drained)
      // merge into the result and show in the UI.
      final cached = await local.findByProspectId(prospectId);
      return Right(_mergeInspections(list, cached));
    } on NetworkException catch (_) {
      // Offline — return whatever drafts the rufero has touched for
      // this prospect. Empty list is a valid answer if they've never
      // loaded this prospect online and never started an inspection
      // offline either.
      final cached = await local.findByProspectId(prospectId);
      return Right(cached);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  /// Merge server + locally-pending inspections, server winning on
  /// id collision (the local copy might be a stub that's already
  /// been drained server-side under a different id — keep both in
  /// that case so the rufero sees their work).
  List<InspectionEntity> _mergeInspections(
    List<InspectionEntity> remote,
    List<InspectionEntity> cached,
  ) {
    final seen = <String>{for (final i in remote) i.id};
    final extras = cached.where((i) => !seen.contains(i.id));
    final out = [...remote, ...extras]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return out;
  }
}
