import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../../../../core/offline/hive_boxes.dart';
import '../../domain/entities/note_entity.dart';

/// Local cache + pending-op tracking for prospect notes.
///
/// Notes are mutable on mobile — rufero can add notes during a visit
/// and (within 15 min) edit/delete them. All three operations get
/// queued through the sync worker when offline, so the local store
/// needs to:
///   - Cache server-side notes after a successful fetch
///   - Hold "pending add" entries (created offline, not yet drained)
///   - Track "pending delete" markers (rows the rufero deleted that
///     still exist server-side — we hide them from the cached read
///     until the delete drains)
///
/// Stored in the shared [prospectCache] Hive box, namespaced:
///   `note:{noteId}`                 → full NoteEntity JSON
///   `note_meta:{noteId}`            → { prospect_id, status } where
///                                     status is 'synced'|'pending_add'|
///                                     'pending_update'|'pending_delete'
abstract class NoteLocalDatasource {
  Future<void> init();

  /// Replace the cached set for a single prospect. Drops stale rows
  /// that aren't in the fresh fetch. Pending rows (add/update/delete)
  /// for this prospect are left alone — they're driven by user intent,
  /// not the server.
  Future<void> cacheList(String prospectId, List<NoteEntity> notes);

  /// All cached notes for a prospect, with pending overlays applied:
  /// pending-add notes are appended, pending-delete notes are hidden,
  /// pending-update notes return the locally-modified body. Sorted
  /// newest first.
  Future<List<NoteEntity>> getCached(String prospectId);

  /// Persist a freshly-created (offline) note. The caller supplies a
  /// client-generated UUID so the drain handler can pass the same id
  /// to the server insert.
  Future<void> savePendingAdd(NoteEntity note);

  /// Persist a locally-edited body. If the note was already
  /// pending-add we leave its status alone (the eventual insert will
  /// pick up the latest body); if it was synced we mark it
  /// pending-update so the queued op replays.
  Future<NoteEntity?> savePendingUpdate({
    required String noteId,
    required String body,
  });

  /// Mark a note as pending-delete (or simply remove it locally if it
  /// was pending-add — there's nothing on the server to delete).
  /// Returns true if the note had already drained (caller should queue
  /// a delete op); false if it was local-only (caller should cancel
  /// the pending add op instead).
  Future<bool> markPendingDelete(String noteId);

  /// Look up a single note by id, regardless of pending status.
  Future<NoteEntity?> getById(String noteId);

  /// Remove pending markers + cached row after a successful drain.
  /// For add/update: the next server fetch will reinstate the canonical
  /// row. For delete: nothing reinstates it — the row is gone.
  Future<void> clearPending(String noteId);
}

class NoteLocalDatasourceImpl implements NoteLocalDatasource {
  Box<String>? _box;

  @override
  Future<void> init() async {
    _box ??= await Hive.openBox<String>(HiveBoxes.prospectCache);
  }

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  String _noteKey(String id) => 'note:$id';
  String _metaKey(String id) => 'note_meta:$id';

  @override
  Future<void> cacheList(String prospectId, List<NoteEntity> notes) async {
    final box = await _opened();
    final fetchedIds = notes.map((n) => n.id).toSet();

    // Drop synced rows for this prospect that aren't in the fresh
    // fetch. Pending rows survive — they belong to the user, not the
    // server.
    for (final key in box.keys.toList()) {
      if (key is! String || !key.startsWith('note_meta:')) continue;
      final noteId = key.substring('note_meta:'.length);
      final meta = _readMeta(box, noteId);
      if (meta == null) continue;
      if (meta['prospect_id'] != prospectId) continue;
      final status = meta['status'] as String? ?? 'synced';
      if (status != 'synced') continue;
      if (!fetchedIds.contains(noteId)) {
        await box.delete(_noteKey(noteId));
        await box.delete(_metaKey(noteId));
      }
    }

    for (final n in notes) {
      // Don't clobber an in-progress local edit — pending state wins.
      final existing = _readMeta(box, n.id);
      final status = existing?['status'] as String?;
      if (status == 'pending_update' || status == 'pending_delete') {
        // Refresh the underlying cached row so a fresh body from
        // the server overlays nicely if the user then aborts.
        await box.put(_noteKey(n.id), _encode(n));
        continue;
      }
      await box.put(_noteKey(n.id), _encode(n));
      await box.put(
        _metaKey(n.id),
        jsonEncode({'prospect_id': n.prospectId, 'status': 'synced'}),
      );
    }
  }

  @override
  Future<List<NoteEntity>> getCached(String prospectId) async {
    final box = await _opened();
    final out = <NoteEntity>[];
    for (final key in box.keys) {
      if (key is! String || !key.startsWith('note_meta:')) continue;
      final noteId = key.substring('note_meta:'.length);
      final meta = _readMeta(box, noteId);
      if (meta == null) continue;
      if (meta['prospect_id'] != prospectId) continue;
      final status = meta['status'] as String? ?? 'synced';
      if (status == 'pending_delete') continue;

      final raw = box.get(_noteKey(noteId));
      if (raw == null) continue;
      try {
        out.add(_decode(raw));
      } catch (_) {
        // Corrupt — skip.
      }
    }
    out.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return out;
  }

  @override
  Future<void> savePendingAdd(NoteEntity note) async {
    final box = await _opened();
    await box.put(_noteKey(note.id), _encode(note));
    await box.put(
      _metaKey(note.id),
      jsonEncode({
        'prospect_id': note.prospectId,
        'status': 'pending_add',
      }),
    );
  }

  @override
  Future<NoteEntity?> savePendingUpdate({
    required String noteId,
    required String body,
  }) async {
    final box = await _opened();
    final raw = box.get(_noteKey(noteId));
    if (raw == null) return null;
    NoteEntity current;
    try {
      current = _decode(raw);
    } catch (_) {
      return null;
    }
    final updated = NoteEntity(
      id: current.id,
      tenantId: current.tenantId,
      prospectId: current.prospectId,
      authorId: current.authorId,
      authorName: current.authorName,
      body: body,
      createdAt: current.createdAt,
    );
    await box.put(_noteKey(noteId), _encode(updated));
    final meta = _readMeta(box, noteId);
    final existingStatus = meta?['status'] as String? ?? 'synced';
    // A pending_add note that gets edited stays pending_add — its
    // eventual insert will carry the latest body. Otherwise mark
    // pending_update so the worker pushes a PATCH.
    final nextStatus =
        existingStatus == 'pending_add' ? 'pending_add' : 'pending_update';
    await box.put(
      _metaKey(noteId),
      jsonEncode({
        'prospect_id': current.prospectId,
        'status': nextStatus,
      }),
    );
    return updated;
  }

  @override
  Future<bool> markPendingDelete(String noteId) async {
    final box = await _opened();
    final meta = _readMeta(box, noteId);
    if (meta == null) return false;
    final status = meta['status'] as String? ?? 'synced';
    if (status == 'pending_add') {
      // Local-only — nuke entirely. Caller cancels the queued add.
      await box.delete(_noteKey(noteId));
      await box.delete(_metaKey(noteId));
      return false;
    }
    await box.put(
      _metaKey(noteId),
      jsonEncode({
        'prospect_id': meta['prospect_id'],
        'status': 'pending_delete',
      }),
    );
    return true;
  }

  @override
  Future<NoteEntity?> getById(String noteId) async {
    final box = await _opened();
    final raw = box.get(_noteKey(noteId));
    if (raw == null) return null;
    try {
      return _decode(raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> clearPending(String noteId) async {
    final box = await _opened();
    final meta = _readMeta(box, noteId);
    if (meta == null) return;
    final status = meta['status'] as String? ?? 'synced';
    if (status == 'pending_delete') {
      // Delete succeeded server-side — drop both the row + marker.
      await box.delete(_noteKey(noteId));
      await box.delete(_metaKey(noteId));
      return;
    }
    // For add/update, flip to synced. The next remote fetch will
    // overwrite the row with the canonical server copy anyway.
    await box.put(
      _metaKey(noteId),
      jsonEncode({'prospect_id': meta['prospect_id'], 'status': 'synced'}),
    );
  }

  // ── helpers ───────────────────────────────────────────────

  Map<String, dynamic>? _readMeta(Box<String> box, String noteId) {
    final raw = box.get(_metaKey(noteId));
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  String _encode(NoteEntity n) => jsonEncode({
        'id': n.id,
        'tenant_id': n.tenantId,
        'prospect_id': n.prospectId,
        'author_id': n.authorId,
        'author_name': n.authorName,
        'body': n.body,
        'created_at': n.createdAt.toIso8601String(),
      });

  NoteEntity _decode(String raw) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return NoteEntity(
      id: m['id'] as String,
      tenantId: m['tenant_id'] as String,
      prospectId: m['prospect_id'] as String,
      authorId: m['author_id'] as String,
      body: m['body'] as String,
      createdAt: DateTime.parse(m['created_at'] as String),
      authorName: m['author_name'] as String?,
    );
  }
}
