import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/entities/availability_block_entity.dart';
import '../../domain/entities/working_hours_entity.dart';
import '../models/availability_block_model.dart';

abstract class AvailabilityRemoteDatasource {
  Future<List<AvailabilityBlockModel>> fetchMyBlocks({
    DateTime? from,
    DateTime? to,
  });

  /// Stream that emits the full block list on every realtime change AND
  /// on a 5-second safety poll (catches RLS-blocked deletes the same way
  /// the prospects feature does — when a row leaves your visibility, no
  /// realtime event fires).
  Stream<List<AvailabilityBlockModel>> watchMyBlocks();

  Future<AvailabilityBlockModel> create(CreateAvailabilityBlockInput input);

  Future<AvailabilityBlockModel> update(
    String id,
    UpdateAvailabilityBlockInput input,
  );

  Future<void> delete(String id);

  /// Reads the rufero's `users.working_hours`. Falls back to
  /// `tenants.working_hours` with `inherited = true` if null.
  Future<WorkingHoursEntity> fetchMyWorkingHours();

  /// Pass null to clear the column (inherit tenant default).
  Future<WorkingHoursEntity> updateMyWorkingHours(WorkingHoursEntity? hours);
}

class AvailabilityRemoteDatasourceImpl implements AvailabilityRemoteDatasource {
  final SupabaseClient client;

  const AvailabilityRemoteDatasourceImpl(this.client);

  String _requireUid() {
    final uid = client.auth.currentUser?.id;
    if (uid == null) throw ServerException('Not authenticated');
    return uid;
  }

  @override
  Future<List<AvailabilityBlockModel>> fetchMyBlocks({
    DateTime? from,
    DateTime? to,
  }) async {
    final uid = _requireUid();
    try {
      var query = client
          .from('rufero_availability_blocks')
          .select()
          .eq('rufero_id', uid);
      if (from != null) {
        query = query.gte('ends_at', from.toUtc().toIso8601String());
      }
      if (to != null) {
        query = query.lte('starts_at', to.toUtc().toIso8601String());
      }
      final response = await query.order('starts_at', ascending: true);
      return (response as List)
          .map((r) =>
              AvailabilityBlockModel.fromMap(r as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load availability: $e');
    }
  }

  @override
  Stream<List<AvailabilityBlockModel>> watchMyBlocks() {
    final uid = client.auth.currentUser?.id;
    if (uid == null) return Stream.value(const []);

    final controller = StreamController<List<AvailabilityBlockModel>>();
    List<AvailabilityBlockModel> lastEmitted = const [];

    Future<void> refetch() async {
      try {
        final fresh = await fetchMyBlocks();
        if (controller.isClosed) return;
        lastEmitted = fresh;
        controller.add(fresh);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    final channel = client
        .channel('availability_blocks_${uid.substring(0, 8)}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'rufero_availability_blocks',
          callback: (_) => refetch(),
        )
        .subscribe();

    // Slow poll for RLS-blocked deletes (rare but possible if an admin
    // reassigns ownership; matches the prospects feature pattern).
    final timer = Timer.periodic(const Duration(seconds: 10), (_) async {
      try {
        final fresh = await fetchMyBlocks();
        if (controller.isClosed) return;
        final freshIds = fresh.map((b) => b.id).toSet();
        final lastIds = lastEmitted.map((b) => b.id).toSet();
        if (freshIds.length != lastIds.length ||
            !freshIds.containsAll(lastIds)) {
          lastEmitted = fresh;
          controller.add(fresh);
        }
      } catch (_) {
        // Swallow — realtime + pull-to-refresh are the primary signals.
      }
    });

    controller.onCancel = () {
      timer.cancel();
      client.removeChannel(channel);
    };

    return controller.stream;
  }

  @override
  Future<AvailabilityBlockModel> create(
    CreateAvailabilityBlockInput input,
  ) async {
    final uid = _requireUid();
    try {
      // tenant_id is required by the row (NOT NULL). The RLS policy uses
      // get_tenant_id() to validate; we look up our row's tenant first.
      final me = await client
          .from('users')
          .select('tenant_id')
          .eq('id', uid)
          .single();
      final tenantId = me['tenant_id'] as String;

      final response = await client
          .from('rufero_availability_blocks')
          .insert({
            'tenant_id': tenantId,
            'rufero_id': uid,
            'starts_at': input.startsAt.toUtc().toIso8601String(),
            'ends_at': input.endsAt.toUtc().toIso8601String(),
            'all_day': input.allDay,
            'kind': input.kind,
            if (input.reason != null) 'reason': input.reason,
            if (input.notes != null) 'notes': input.notes,
            if (input.recurrenceRule != null)
              'recurrence_rule': input.recurrenceRule,
            'created_by': uid,
          })
          .select()
          .single();

      return AvailabilityBlockModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) {
        // 23P01 = EXCLUDE-constraint violation = overlapping busy block.
        if (e.code == '23P01') {
          throw ServerException('You already have a block at this time.');
        }
        throw ServerException(e.message);
      }
      throw ServerException('Failed to create block: $e');
    }
  }

  @override
  Future<AvailabilityBlockModel> update(
    String id,
    UpdateAvailabilityBlockInput input,
  ) async {
    _requireUid();
    try {
      final patch = <String, dynamic>{};
      if (input.startsAt != null) {
        patch['starts_at'] = input.startsAt!.toUtc().toIso8601String();
      }
      if (input.endsAt != null) {
        patch['ends_at'] = input.endsAt!.toUtc().toIso8601String();
      }
      if (input.allDay != null) patch['all_day'] = input.allDay;
      if (input.kind != null) patch['kind'] = input.kind;
      if (input.reason != null) patch['reason'] = input.reason;
      if (input.notes != null) patch['notes'] = input.notes;
      if (input.clearRecurrence) {
        patch['recurrence_rule'] = null;
      } else if (input.recurrenceRule != null) {
        patch['recurrence_rule'] = input.recurrenceRule;
      }

      final response = await client
          .from('rufero_availability_blocks')
          .update(patch)
          .eq('id', id)
          .select()
          .single();
      return AvailabilityBlockModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) {
        if (e.code == '23P01') {
          throw ServerException(
              'That change would overlap another block.');
        }
        throw ServerException(e.message);
      }
      throw ServerException('Failed to update block: $e');
    }
  }

  @override
  Future<void> delete(String id) async {
    _requireUid();
    try {
      await client
          .from('rufero_availability_blocks')
          .delete()
          .eq('id', id);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to delete block: $e');
    }
  }

  @override
  Future<WorkingHoursEntity> fetchMyWorkingHours() async {
    final uid = _requireUid();
    try {
      final me = await client
          .from('users')
          .select('tenant_id, working_hours')
          .eq('id', uid)
          .single();

      final userHours = me['working_hours'];
      if (userHours != null) {
        return WorkingHoursEntity.fromJson(
          userHours as Map<String, dynamic>,
          inherited: false,
        );
      }

      // Fall back to tenant default.
      final tenant = await client
          .from('tenants')
          .select('working_hours')
          .eq('id', me['tenant_id'] as String)
          .single();
      return WorkingHoursEntity.fromJson(
        tenant['working_hours'] as Map<String, dynamic>?,
        inherited: true,
      );
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load working hours: $e');
    }
  }

  @override
  Future<WorkingHoursEntity> updateMyWorkingHours(
    WorkingHoursEntity? hours,
  ) async {
    final uid = _requireUid();
    try {
      await client
          .from('users')
          .update({'working_hours': hours?.toJson()})
          .eq('id', uid);
      return fetchMyWorkingHours();
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to update working hours: $e');
    }
  }
}
