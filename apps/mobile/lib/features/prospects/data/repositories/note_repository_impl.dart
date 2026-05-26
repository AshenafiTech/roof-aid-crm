import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/offline/sync_op.dart';
import '../../../../core/offline/sync_worker.dart';
import '../../domain/entities/note_entity.dart';
import '../../domain/repositories/note_repository.dart';
import '../datasources/note_local_datasource.dart';
import '../datasources/note_remote_datasource.dart';

/// Local-first repository for prospect notes.
///
/// Writes (add/update/delete) commit to Hive immediately + enqueue a
/// sync op; reads merge cached server rows with locally-pending ones.
///
/// Three sync ops + handlers live in the constructor: `note_add`,
/// `note_update`, `note_delete`. Each one looks the latest state up
/// from the local cache when it drains, so multiple offline edits to
/// the same note coalesce naturally (the dedupKey is the noteId).
class NoteRepositoryImpl implements NoteRepository {
  final NoteRemoteDatasource remoteDatasource;
  final NoteLocalDatasource local;
  final SyncWorker syncWorker;
  final SupabaseClient supabase;
  final Uuid _uuid;

  /// Pulse fires after every local change. [watchNotes] listens to
  /// re-merge so the UI sees a freshly-added offline note immediately
  /// without waiting for a server roundtrip.
  final StreamController<String> _localChanges =
      StreamController<String>.broadcast();

  NoteRepositoryImpl({
    required this.remoteDatasource,
    required this.local,
    required this.syncWorker,
    required this.supabase,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid() {
    // ── Add: re-insert from the locally-cached body. The note's
    //    id was generated client-side so the server row carries
    //    the same UUID — subsequent update/delete ops still find it.
    syncWorker.registerHandler(
      SyncOpKind.noteAdd,
      (op) async {
        final noteId = op.payload['note_id'] as String;
        final note = await local.getById(noteId);
        if (note == null) return;
        try {
          await remoteDatasource.addNote(
            id: noteId,
            prospectId: note.prospectId,
            body: note.body,
          );
        } on PostgrestException catch (e) {
          // Duplicate key means we (or the user, via the web) already
          // inserted this — treat as success and clear the pending
          // marker. Anything else re-throws and stays queued.
          if (e.code != '23505') rethrow;
        }
        await local.clearPending(noteId);
        _localChanges.add(note.prospectId);
      },
    );

    // ── Update: re-push the latest body. Dedup by noteId means a
    //    flurry of typing collapses into one PATCH.
    syncWorker.registerHandler(
      SyncOpKind.noteUpdate,
      (op) async {
        final noteId = op.payload['note_id'] as String;
        final note = await local.getById(noteId);
        if (note == null) return;
        await remoteDatasource.updateNote(noteId: noteId, body: note.body);
        await local.clearPending(noteId);
        _localChanges.add(note.prospectId);
      },
    );

    // ── Delete: nothing else to read; payload carries the id.
    syncWorker.registerHandler(
      SyncOpKind.noteDelete,
      (op) async {
        final noteId = op.payload['note_id'] as String;
        final prospectId = op.payload['prospect_id'] as String?;
        try {
          await remoteDatasource.deleteNote(noteId);
        } on PostgrestException catch (e) {
          // Already gone server-side — treat as success.
          if (e.code != 'PGRST116') rethrow;
        }
        await local.clearPending(noteId);
        if (prospectId != null) _localChanges.add(prospectId);
      },
    );
  }

  @override
  Future<Either<Failure, List<NoteEntity>>> getNotes(String prospectId) async {
    try {
      final notes = await remoteDatasource.fetchForProspect(prospectId);
      await local.cacheList(prospectId, notes);
      // Read back through the cache so pending overlays apply.
      return Right(await local.getCached(prospectId));
    } on NetworkException catch (_) {
      // Offline — surface what we have.
      return Right(await local.getCached(prospectId));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<NoteEntity>> watchNotes(String prospectId) {
    // Three sources merge: an immediate cache emit, the remote
    // realtime stream (with caching on every tick), and a local-change
    // pulse so offline add/edit/delete shows up the moment Hive is
    // written.
    final controller = StreamController<List<NoteEntity>>();

    Future<void> emitCached() async {
      if (controller.isClosed) return;
      controller.add(await local.getCached(prospectId));
    }

    emitCached();
    final remoteSub = remoteDatasource.watchForProspect(prospectId).listen(
      (list) async {
        await local.cacheList(prospectId, list);
        if (controller.isClosed) return;
        controller.add(await local.getCached(prospectId));
      },
      onError: (Object _) => emitCached(),
    );
    final localSub = _localChanges.stream
        .where((id) => id == prospectId || id.isEmpty)
        .listen((_) => emitCached());

    controller.onCancel = () async {
      await remoteSub.cancel();
      await localSub.cancel();
    };
    return controller.stream;
  }

  @override
  Future<Either<Failure, NoteEntity>> addNote({
    required String prospectId,
    required String body,
  }) async {
    // Build a local note up front so the UI gets an entity back the
    // instant the bloc dispatches. authorName is null offline — the
    // canonical row from the server will fill it in later.
    final noteId = _uuid.v4();
    final draft = NoteEntity(
      id: noteId,
      tenantId: '',
      prospectId: prospectId,
      authorId: supabase.auth.currentUser?.id ?? '',
      body: body,
      createdAt: DateTime.now(),
    );
    await local.savePendingAdd(draft);
    _localChanges.add(prospectId);

    try {
      final saved = await remoteDatasource.addNote(
        id: noteId,
        prospectId: prospectId,
        body: body,
      );
      // Drop the pending marker and refresh the cached row with the
      // server-side copy (real tenant_id + author_name).
      await local.cacheList(prospectId, [saved]);
      _localChanges.add(prospectId);
      return Right(saved);
    } on NetworkException catch (_) {
      await syncWorker.enqueue(
        kind: SyncOpKind.noteAdd,
        payload: {'note_id': noteId, 'prospect_id': prospectId},
        dedupKey: noteId,
      );
      return Right(draft);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, NoteEntity>> updateNote({
    required String noteId,
    required String body,
  }) async {
    // Always reflect the edit locally first — this is what gives the
    // user the "saved immediately" feel.
    final updated = await local.savePendingUpdate(noteId: noteId, body: body);
    if (updated == null) {
      // No local copy — fall through to remote, which will succeed
      // online and return a real entity; offline it'll fail loud
      // (we have nothing sensible to surface).
      try {
        final remote = await remoteDatasource.updateNote(
          noteId: noteId,
          body: body,
        );
        return Right(remote);
      } on NetworkException catch (e) {
        return Left(NetworkFailure(e.message));
      } on ServerException catch (e) {
        return Left(ServerFailure(e.message));
      }
    }
    _localChanges.add(updated.prospectId);

    try {
      final saved = await remoteDatasource.updateNote(
        noteId: noteId,
        body: body,
      );
      await local.cacheList(saved.prospectId, [saved]);
      _localChanges.add(saved.prospectId);
      return Right(saved);
    } on NetworkException catch (_) {
      await syncWorker.enqueue(
        kind: SyncOpKind.noteUpdate,
        payload: {'note_id': noteId},
        dedupKey: noteId,
      );
      return Right(updated);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> deleteNote(String noteId) async {
    final note = await local.getById(noteId);
    final prospectId = note?.prospectId;

    final hadServerCopy = await local.markPendingDelete(noteId);
    if (prospectId != null) _localChanges.add(prospectId);

    if (!hadServerCopy) {
      // Local-only note (still pending_add) — drop the queued insert
      // so it never replays.
      await syncWorker.cancelPending(
        kind: SyncOpKind.noteAdd,
        dedupKey: noteId,
      );
      return const Right(unit);
    }

    try {
      await remoteDatasource.deleteNote(noteId);
      await local.clearPending(noteId);
      if (prospectId != null) _localChanges.add(prospectId);
      return const Right(unit);
    } on NetworkException catch (_) {
      await syncWorker.enqueue(
        kind: SyncOpKind.noteDelete,
        payload: {'note_id': noteId, 'prospect_id': prospectId},
        dedupKey: noteId,
      );
      return const Right(unit);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
