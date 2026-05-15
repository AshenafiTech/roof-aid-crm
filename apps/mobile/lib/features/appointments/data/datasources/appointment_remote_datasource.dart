import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../models/appointment_model.dart';

abstract class AppointmentRemoteDatasource {
  Future<List<AppointmentModel>> fetchMine({DateTime? from, DateTime? to});
  Stream<List<AppointmentModel>> watchMine();

  /// Calls the `transition_appointment` RPC. Returns the parsed
  /// `{ ok, error }` envelope; throws `ServerException` on non-OK with
  /// the error.message attached.
  Future<void> transition({
    required String appointmentId,
    required String to,
    String? reason,
  });
}

class AppointmentRemoteDatasourceImpl implements AppointmentRemoteDatasource {
  final SupabaseClient client;

  const AppointmentRemoteDatasourceImpl(this.client);

  String _requireUid() {
    final uid = client.auth.currentUser?.id;
    if (uid == null) throw ServerException('Not authenticated');
    return uid;
  }

  @override
  Future<List<AppointmentModel>> fetchMine({
    DateTime? from,
    DateTime? to,
  }) async {
    final uid = _requireUid();
    try {
      var query = client
          .from('appointments')
          .select(
            '*, prospect:prospects(id, name, address, city, state, phones)',
          )
          .eq('rufero_id', uid);
      if (from != null) {
        query = query.gte('scheduled_at', from.toUtc().toIso8601String());
      }
      if (to != null) {
        query = query.lte('scheduled_at', to.toUtc().toIso8601String());
      }
      final response =
          await query.order('scheduled_at', ascending: true);
      return (response as List)
          .map((r) => AppointmentModel.fromMap(r as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load appointments: $e');
    }
  }

  @override
  Stream<List<AppointmentModel>> watchMine() {
    final uid = client.auth.currentUser?.id;
    if (uid == null) return Stream.value(const []);

    final controller = StreamController<List<AppointmentModel>>();
    List<AppointmentModel> last = const [];

    Future<void> refetch() async {
      try {
        final fresh = await fetchMine();
        if (controller.isClosed) return;
        last = fresh;
        controller.add(fresh);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    final channel = client
        .channel('appointments_${uid.substring(0, 8)}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'appointments',
          callback: (_) => refetch(),
        )
        .subscribe();

    // 10 s safety poll for status changes that don't trigger payload.
    final timer = Timer.periodic(const Duration(seconds: 10), (_) async {
      try {
        final fresh = await fetchMine();
        if (controller.isClosed) return;
        if (_hasChanged(last, fresh)) {
          last = fresh;
          controller.add(fresh);
        }
      } catch (_) {}
    });

    controller.onCancel = () {
      timer.cancel();
      client.removeChannel(channel);
    };

    return controller.stream;
  }

  bool _hasChanged(List<AppointmentModel> a, List<AppointmentModel> b) {
    if (a.length != b.length) return true;
    final aKeys = a.map((x) => '${x.id}:${x.status}:${x.scheduledAt.toIso8601String()}').toSet();
    final bKeys = b.map((x) => '${x.id}:${x.status}:${x.scheduledAt.toIso8601String()}').toSet();
    return !aKeys.containsAll(bKeys) || !bKeys.containsAll(aKeys);
  }

  @override
  Future<void> transition({
    required String appointmentId,
    required String to,
    String? reason,
  }) async {
    _requireUid();
    try {
      final response = await client.rpc(
        'transition_appointment',
        params: {
          'p_appointment_id': appointmentId,
          'p_to': to,
          'p_reason': ?reason,
        },
      );

      if (response is Map<String, dynamic>) {
        final ok = response['ok'] == true;
        if (!ok) {
          final err = response['error'];
          final code = err is Map ? err['code']?.toString() : null;
          final message = err is Map
              ? (err['message']?.toString() ?? 'Transition failed')
              : 'Transition failed';
          throw ServerException(
            code != null ? '$code: $message' : message,
          );
        }
      }
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to transition: $e');
    }
  }
}
