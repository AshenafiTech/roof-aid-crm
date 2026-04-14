import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../models/prospect_model.dart';

abstract class ProspectRemoteDatasource {
  /// One-shot fetch of the current user's assigned prospects.
  Future<List<ProspectModel>> fetchAssigned();

  /// Realtime stream of the current user's assigned prospects.
  /// Emits the initial snapshot and updates on every DB change.
  Stream<List<ProspectModel>> watchAssigned();
}

class ProspectRemoteDatasourceImpl implements ProspectRemoteDatasource {
  final SupabaseClient client;

  const ProspectRemoteDatasourceImpl(this.client);

  @override
  Future<List<ProspectModel>> fetchAssigned() async {
    final userId = client.auth.currentUser?.id;
    if (userId == null) {
      throw ServerException('Not authenticated');
    }

    try {
      final response = await client
          .from('prospects')
          .select()
          .eq('assigned_to', userId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((row) => ProspectModel.fromMap(row as Map<String, dynamic>))
          .toList(growable: false);
    } on PostgrestException catch (e) {
      throw ServerException(e.message);
    } catch (e) {
      throw ServerException('Failed to load prospects: $e');
    }
  }

  @override
  Stream<List<ProspectModel>> watchAssigned() {
    final userId = client.auth.currentUser?.id;
    if (userId == null) {
      // No session — emit an empty list and complete. The BLoC's auth flow
      // will re-subscribe once the user signs back in.
      return Stream.value(const []);
    }

    // Supabase `.stream()` yields the initial snapshot + every realtime
    // change as a single `List<Map>` stream. Sort locally because the
    // stream helper only supports ordering by the primary key.
    return client
        .from('prospects')
        .stream(primaryKey: const ['id'])
        .eq('assigned_to', userId)
        .map((rows) {
      final models = rows
          .map((r) => ProspectModel.fromMap(r))
          .toList(growable: false)
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return models;
    });
  }
}
