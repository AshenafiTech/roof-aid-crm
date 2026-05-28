import 'dart:async';

import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/offline/sync_op.dart';
import '../../../../core/offline/sync_worker.dart';
import '../../../documents/domain/repositories/document_repository.dart';
import '../../domain/entities/appointment_entity.dart';
import '../../domain/repositories/appointment_repository.dart';
import '../datasources/appointment_local_datasource.dart';
import '../datasources/appointment_remote_datasource.dart';

/// Local-first appointment repository.
///
/// Reads: try remote → cache the result for the offline path. On a
/// network failure, fall back to the cached list with any pending
/// transitions overlaid on top so the UI shows the optimistic status
/// (e.g. "Completed" the instant the rufero taps Mark complete).
///
/// Writes: transitions are queued through the [SyncWorker]. The drain
/// handler reads the latest pending row from the local cache and
/// replays it against the `transition_appointment` RPC.
class AppointmentRepositoryImpl implements AppointmentRepository {
  final AppointmentRemoteDatasource remote;
  final AppointmentLocalDatasource local;
  final SyncWorker syncWorker;

  /// Optional cross-feature dep: after a successful schedule fetch we
  /// fire-and-forget a per-prospect document warm-up so the rufero
  /// arrives at each visit with the PDFs already on disk.
  ///
  /// Stored as a resolver (not the repo directly) so DI registration
  /// order doesn't matter — this repo registers eagerly, the docs
  /// repo registers later, and we resolve lazily at call time.
  final DocumentRepository Function()? documentsForPreCache;

  /// Pulse fires after any local-side change (cached list refresh,
  /// pending transition added/cleared). [watchMyAppointments] listens
  /// to this and re-runs its merge so a Mark complete tap reflects
  /// in every open view immediately without waiting for realtime.
  final StreamController<void> _localChanges =
      StreamController<void>.broadcast();

  AppointmentRepositoryImpl({
    required this.remote,
    required this.local,
    required this.syncWorker,
    this.documentsForPreCache,
  }) {
    // Drain handler: re-send the pending transition we stashed
    // locally. Idempotent — running it twice maps to the same server
    // state (e.g. completed → completed).
    syncWorker.registerHandler(
      SyncOpKind.appointmentTransition,
      (op) async {
        final appointmentId = op.payload['appointment_id'] as String;
        final pending = await local.getPendingTransition(appointmentId);
        if (pending == null) return;
        await remote.transition(
          appointmentId: appointmentId,
          to: pending.toStatus,
          reason: pending.reason,
        );
        await local.clearPendingTransition(appointmentId);
        _localChanges.add(null);
      },
    );
  }

  @override
  Future<Either<Failure, List<AppointmentEntity>>> getMyAppointments({
    DateTime? from,
    DateTime? to,
  }) async {
    try {
      final list = await remote.fetchMine(from: from, to: to);
      // Refresh the cache so the next offline read is up to date.
      // We only cache the unfiltered "mine" fetch — date-range
      // filtering happens off the same cached set on the read side.
      if (from == null && to == null) {
        await local.cacheList(list);
        _localChanges.add(null);
      }
      // Fire-and-forget doc pre-cache for every unique prospect on
      // the schedule. The rufero loads their day in the morning with
      // signal → PDFs land on disk → afternoon offline view "just
      // works".
      unawaited(_warmDocsFor(list));
      return Right(list);
    } on NetworkException catch (_) {
      // Offline — fall back to the cached set with pending overlays.
      final cached = await local.getCached();
      final filtered = _applyDateFilter(cached, from: from, to: to);
      return Right(filtered);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<AppointmentEntity>> watchMyAppointments() {
    // Three sources merge into one stream:
    //   - remote realtime (when online)
    //   - one immediate emit from the cache (so an offline-boot rufero
    //     sees their schedule right away)
    //   - local-change pulses (after a pending transition flip or a
    //     drain that cleared one)
    final controller = StreamController<List<AppointmentEntity>>();

    Future<void> emitCached() async {
      if (controller.isClosed) return;
      controller.add(await local.getCached());
    }

    // Immediate cache emit + subscriptions.
    emitCached();
    final remoteSub = remote.watchMine().listen(
      (list) async {
        await local.cacheList(list);
        if (controller.isClosed) return;
        controller.add(await local.getCached());
      },
      onError: (Object _) {
        // Stay on the cached set rather than dropping the stream.
        emitCached();
      },
    );
    final localSub = _localChanges.stream.listen((_) => emitCached());

    controller.onCancel = () async {
      await remoteSub.cancel();
      await localSub.cancel();
    };
    return controller.stream;
  }

  @override
  Future<Either<Failure, List<AppointmentEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      return Right(list);
    } on NetworkException catch (_) {
      // Per-prospect lookups fall back to whatever subset of the
      // rufero's cache matches this prospect. Admin / telefonista
      // would normally see everyone's appointments here — that
      // broader view isn't cached yet (the rufero is the offline use
      // case), so they'll see only their own per-prospect rows.
      final cached = await local.getCachedForProspect(prospectId);
      return Right(cached);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> transition({
    required String appointmentId,
    required String to,
    String? reason,
  }) async {
    try {
      await remote.transition(
        appointmentId: appointmentId,
        to: to,
        reason: reason,
      );
      // In case the rufero had previously queued this same transition
      // and is now back online, clear any leftover pending row.
      await local.clearPendingTransition(appointmentId);
      _localChanges.add(null);
      return const Right(unit);
    } on NetworkException catch (_) {
      // Offline — apply the override locally + queue the RPC for the
      // next drain. The UI will see the new status the moment the
      // pending row is written (via _localChanges).
      await local.markPendingTransition(
        appointmentId: appointmentId,
        toStatus: to,
        reason: reason,
      );
      await syncWorker.enqueue(
        kind: SyncOpKind.appointmentTransition,
        payload: {'appointment_id': appointmentId},
        dedupKey: appointmentId,
      );
      _localChanges.add(null);
      return const Right(unit);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  // ── helpers ───────────────────────────────────────────────

  /// Kick the documents repo to pre-cache PDFs for every unique
  /// prospect on the schedule. Best-effort and silent — any failure
  /// just means the rufero falls back to the on-demand cache path
  /// next time they open a doc.
  Future<void> _warmDocsFor(List<AppointmentEntity> list) async {
    final resolver = documentsForPreCache;
    if (resolver == null) return;
    final docsRepo = resolver();
    final seen = <String>{};
    for (final a in list) {
      if (!seen.add(a.prospectId)) continue;
      // getForProspect internally caches both the doc metadata list
      // and (fire-and-forget) the PDF bytes.
      try {
        await docsRepo.getForProspect(a.prospectId);
      } catch (_) {
        // ignore — best effort warm-up.
      }
    }
  }

  List<AppointmentEntity> _applyDateFilter(
    List<AppointmentEntity> list, {
    DateTime? from,
    DateTime? to,
  }) {
    Iterable<AppointmentEntity> result = list;
    if (from != null) {
      result = result.where((a) => !a.scheduledAt.isBefore(from));
    }
    if (to != null) {
      result = result.where((a) => !a.scheduledAt.isAfter(to));
    }
    return result.toList();
  }
}
