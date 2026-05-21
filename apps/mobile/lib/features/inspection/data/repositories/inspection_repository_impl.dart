import 'dart:typed_data';

import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/offline/sync_op.dart';
import '../../../../core/offline/sync_worker.dart';
import '../../domain/entities/inspection_entity.dart';
import '../../domain/entities/photo_entity.dart';
import '../../domain/repositories/inspection_repository.dart';
import '../datasources/inspection_local_datasource.dart';
import '../datasources/inspection_remote_datasource.dart';

/// Local-first repository. Form fields go to Hive immediately and the
/// server write is queued behind the [SyncWorker]; photos and other
/// operations still hit the network directly (handled in later slices).
///
/// The handler for [SyncOpKind.inspectionFormPatch] is registered in
/// the constructor — it reads the LATEST draft from Hive when it
/// drains, not the snapshot in the op payload. That way a typing burst
/// over a long offline stretch collapses into exactly one server write
/// rather than one per keystroke.
class InspectionRepositoryImpl implements InspectionRepository {
  final InspectionRemoteDatasource remote;
  final InspectionLocalDatasource local;
  final SyncWorker syncWorker;

  InspectionRepositoryImpl({
    required this.remote,
    required this.local,
    required this.syncWorker,
  }) {
    // Replay handler: drain pending form patches by re-sending the
    // latest local draft. Idempotent — running it twice is a no-op
    // since the server takes the most recent values either way.
    syncWorker.registerHandler(
      SyncOpKind.inspectionFormPatch,
      (op) async {
        final inspectionId = op.payload['inspection_id'] as String;
        final draft = await local.getById(inspectionId);
        if (draft == null) {
          // Nothing local to push — treat as drained.
          return;
        }
        final isDirty = await local.isDirty(inspectionId);
        if (!isDirty) return;
        final updated = await remote.saveDamageForm(
          inspectionId: inspectionId,
          form: DamageFormData.fromInspection(draft),
        );
        await local.save(updated, dirty: false);
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
    } on NetworkException catch (e) {
      // Offline — fall back to a previously cached draft for this
      // appointment if we have one.
      final cached = await local.findByAppointmentId(appointmentId);
      if (cached != null) return Right(cached);
      return Left(NetworkFailure(e.message));
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
    try {
      final list = await remote.fetchPhotos(inspectionId);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<PhotoEntity>> watchPhotos(String inspectionId) =>
      remote.watchPhotos(inspectionId);

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
    try {
      final p = await remote.uploadPhoto(
        inspectionId: inspectionId,
        prospectId: prospectId,
        bytes: bytes,
        tags: tags,
        gpsLat: gpsLat,
        gpsLng: gpsLng,
        widthPx: widthPx,
        heightPx: heightPx,
      );
      return Right(p);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> deletePhoto(String photoId) async {
    try {
      await remote.deletePhoto(photoId);
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, PhotoEntity>> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  }) async {
    try {
      final p = await remote.updatePhotoTags(photoId: photoId, tags: tags);
      return Right(p);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, String>> getPhotoSignedUrl(String storagePath) async {
    try {
      final url = await remote.getPhotoSignedUrl(storagePath);
      return Right(url);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<InspectionEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
