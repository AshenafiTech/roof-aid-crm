import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../models/prospect_model.dart';

abstract class ProspectRemoteDatasource {
  /// One-shot fetch of the current user's assigned prospects.
  Future<List<ProspectModel>> fetchAssigned();

  /// Realtime stream of the current user's assigned prospects.
  /// On every DB change, re-fetches the full list so filters are always accurate.
  /// Also polls every 10 seconds to catch unassignment events blocked by RLS.
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
      return Stream.value(const []);
    }

    final controller = StreamController<List<ProspectModel>>();
    List<ProspectModel> lastEmitted = [];

    Future<void> refetch() async {
      try {
        final prospects = await fetchAssigned();
        if (!controller.isClosed) {
          lastEmitted = prospects;
          controller.add(prospects);
        }
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    // Fetch initial data
    refetch();

    // Listen for realtime changes — catches new assignments
    final channel = client
        .channel('prospects_realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'prospects',
          callback: (_) => refetch(),
        )
        .subscribe();

    // Poll every 5 seconds to catch unassignments.
    // When a prospect is unassigned from this rufero, RLS blocks the
    // realtime event (the rufero can no longer read that row). Polling
    // is the only reliable way to detect removals.
    final timer = Timer.periodic(const Duration(seconds: 5), (_) async {
      try {
        final fresh = await fetchAssigned();
        if (controller.isClosed) return;

        // Compare IDs to detect any change (not just count)
        final freshIds = fresh.map((p) => p.id).toSet();
        final lastIds = lastEmitted.map((p) => p.id).toSet();

        if (freshIds.length != lastIds.length || !freshIds.containsAll(lastIds)) {
          lastEmitted = fresh;
          controller.add(fresh);
        }
      } catch (_) {
        // Swallow polling errors — realtime + pull-to-refresh still work
      }
    });

    controller.onCancel = () {
      timer.cancel();
      client.removeChannel(channel);
    };

    return controller.stream;
  }
}
