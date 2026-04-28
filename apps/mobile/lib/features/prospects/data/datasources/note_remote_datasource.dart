import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../models/note_model.dart';

abstract class NoteRemoteDatasource {
  Future<List<NoteModel>> fetchForProspect(String prospectId);

  Stream<List<NoteModel>> watchForProspect(String prospectId);

  Future<NoteModel> addNote({
    required String prospectId,
    required String body,
  });

  Future<NoteModel> updateNote({required String noteId, required String body});

  Future<void> deleteNote(String noteId);
}

class NoteRemoteDatasourceImpl implements NoteRemoteDatasource {
  final SupabaseClient client;

  // Joined select so the UI can show "written by …" without a second query.
  static const _selectWithAuthor =
      '*, author:users!author_id(first_name, last_name)';

  const NoteRemoteDatasourceImpl(this.client);

  @override
  Future<List<NoteModel>> fetchForProspect(String prospectId) async {
    _requireUser();

    try {
      final response = await client
          .from('notes')
          .select(_selectWithAuthor)
          .eq('prospect_id', prospectId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((row) => NoteModel.fromMap(row as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Failed to load notes: $e');
    }
  }

  @override
  Stream<List<NoteModel>> watchForProspect(String prospectId) {
    if (client.auth.currentUser == null) return Stream.value(const []);

    final controller = StreamController<List<NoteModel>>();

    Future<void> refetch() async {
      try {
        final notes = await fetchForProspect(prospectId);
        if (!controller.isClosed) controller.add(notes);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    // Listen for any notes change and re-fetch — server-side filters have
    // been flaky in this setup, so mirror the prospects datasource pattern.
    // refetch() is already scoped by prospect_id, so the UI stays correct.
    final channel = client
        .channel('notes_realtime_$prospectId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'notes',
          callback: (_) => refetch(),
        )
        .subscribe();

    controller.onCancel = () {
      client.removeChannel(channel);
    };

    return controller.stream;
  }

  @override
  Future<NoteModel> addNote({
    required String prospectId,
    required String body,
  }) async {
    final userId = _requireUser();

    try {
      final profile = await client
          .from('users')
          .select('tenant_id')
          .eq('id', userId)
          .single();
      final tenantId = profile['tenant_id'] as String?;
      if (tenantId == null) {
        throw ServerException('Profile has no tenant');
      }

      final inserted = await client
          .from('notes')
          .insert({
            'prospect_id': prospectId,
            'body': body,
            'author_id': userId,
            'tenant_id': tenantId,
          })
          .select(_selectWithAuthor)
          .single();

      return NoteModel.fromMap(inserted);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Failed to add note: $e');
    }
  }

  @override
  Future<NoteModel> updateNote({
    required String noteId,
    required String body,
  }) async {
    _requireUser();

    try {
      final updated = await client
          .from('notes')
          .update({'body': body})
          .eq('id', noteId)
          .select(_selectWithAuthor)
          .maybeSingle();

      if (updated == null) {
        // RLS either hid the row or the 15-minute window has closed.
        throw ServerException('Edit window has expired');
      }

      return NoteModel.fromMap(updated);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Failed to update note: $e');
    }
  }

  @override
  Future<void> deleteNote(String noteId) async {
    _requireUser();

    try {
      // `.select()` forces Postgrest to return the affected rows so we can
      // tell the difference between "RLS hid it / window expired" and a
      // real delete.
      final deleted = await client
          .from('notes')
          .delete()
          .eq('id', noteId)
          .select('id');

      if ((deleted as List).isEmpty) {
        throw ServerException('Delete window has expired');
      }
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Failed to delete note: $e');
    }
  }

  String _requireUser() {
    final userId = client.auth.currentUser?.id;
    if (userId == null) throw ServerException('Not authenticated');
    return userId;
  }
}
