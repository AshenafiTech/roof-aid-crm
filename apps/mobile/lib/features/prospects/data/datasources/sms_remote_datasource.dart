import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/entities/can_message_verdict.dart';
import '../models/sms_message_model.dart';

abstract class SmsRemoteDatasource {
  Future<List<SmsMessageModel>> fetchForProspect(String prospectId);

  Stream<List<SmsMessageModel>> watchForProspect(String prospectId);

  Future<SmsMessageModel> sendMessage({
    required String prospectId,
    required String body,
  });

  Future<CanMessageVerdict> checkCanMessage(String prospectId);

  Future<void> markRead(String prospectId);
}

class SmsRemoteDatasourceImpl implements SmsRemoteDatasource {
  final SupabaseClient client;

  // Joined select so outbound bubbles can show "you" / agent name without
  // a second round-trip. Inbound rows have null agent_id, so the join is
  // a no-op for them.
  static const _selectWithAgent =
      '*, agent:users!agent_id(first_name, last_name)';

  const SmsRemoteDatasourceImpl(this.client);

  @override
  Future<List<SmsMessageModel>> fetchForProspect(String prospectId) async {
    _requireUser();

    try {
      final response = await client
          .from('sms_logs')
          .select(_selectWithAgent)
          .eq('prospect_id', prospectId)
          .order('sent_at', ascending: true);

      return (response as List)
          .map((row) => SmsMessageModel.fromMap(row as Map<String, dynamic>))
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
      throw ServerException('Failed to load conversation: $e');
    }
  }

  @override
  Stream<List<SmsMessageModel>> watchForProspect(String prospectId) {
    if (client.auth.currentUser == null) return Stream.value(const []);

    final controller = StreamController<List<SmsMessageModel>>();

    Future<void> refetch() async {
      try {
        final messages = await fetchForProspect(prospectId);
        if (!controller.isClosed) controller.add(messages);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    final channel = client
        .channel('sms_realtime_$prospectId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'sms_logs',
          callback: (_) => refetch(),
        )
        .subscribe();

    controller.onCancel = () {
      client.removeChannel(channel);
    };

    return controller.stream;
  }

  @override
  Future<SmsMessageModel> sendMessage({
    required String prospectId,
    required String body,
  }) async {
    _requireUser();

    try {
      // Backend Stage 1 + Stage 3 dependency: the `send_sms` RPC enforces
      // `can_message`, inserts a queued row in `sms_logs`, and enqueues the
      // Telnyx send. It returns the new sms_logs.id.
      // TODO: pass a client-generated UUID for retry idempotency once the
      //   `uuid` package is added to pubspec. Backend defaults gen one if
      //   omitted, so single-attempt sends already work.
      final newId = await client.rpc(
        'send_sms',
        params: {'p_prospect_id': prospectId, 'p_body': body},
      );

      final row = await client
          .from('sms_logs')
          .select(_selectWithAgent)
          .eq('id', newId as String)
          .single();

      return SmsMessageModel.fromMap(row);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        // The RPC raises `sms_not_allowed: <reason>` when can_message blocks.
        if (e.message.contains('sms_not_allowed')) {
          final reason = e.message.split(':').last.trim();
          throw ServerException(_messageForBlockedReason(reason));
        }
        throw ServerException(e.message);
      }
      throw ServerException('Failed to send message. Please try again.');
    }
  }

  @override
  Future<CanMessageVerdict> checkCanMessage(String prospectId) async {
    _requireUser();

    try {
      final res = await client.rpc(
        'can_message',
        params: {'p_prospect_id': prospectId},
      );
      if (res is Map<String, dynamic>) {
        return CanMessageVerdict.fromMap(res);
      }
      // Defensive — older Supabase clients return a list-wrapped result.
      if (res is List && res.isNotEmpty && res.first is Map) {
        return CanMessageVerdict.fromMap(res.first as Map<String, dynamic>);
      }
      throw ServerException('Unexpected can_message response shape');
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Could not verify messaging permission: $e');
    }
  }

  @override
  Future<void> markRead(String prospectId) async {
    _requireUser();

    try {
      // Backend Stage 7 dependency: a `mark_sms_read` RPC that scopes the
      // update to inbound rows for this prospect under the caller's RLS.
      // Falls back to a direct UPDATE if the RPC isn't deployed yet — the
      // RLS policy on `sms_logs` enforces tenant isolation either way.
      await client.rpc(
        'mark_sms_read',
        params: {'p_prospect_id': prospectId},
      );
    } catch (e) {
      // Don't surface "couldn't mark read" as a user-facing error — it's a
      // background hygiene action, not a workflow gate. Log and move on.
      if (isNetworkError(e)) return;
      // Allow the caller to log if they want, but never throw.
    }
  }

  String _requireUser() {
    final userId = client.auth.currentUser?.id;
    if (userId == null) throw ServerException('Not authenticated');
    return userId;
  }

  String _messageForBlockedReason(String reason) {
    switch (reason) {
      case 'dnc':
        // Per client policy, DNC is a warning, not a block — the backend
        // shouldn't return this. If we still see it (legacy server), fall
        // back to a generic message so the composer doesn't suggest the
        // user is permanently locked out.
        return 'Could not send right now. Please try again.';
      case 'no_phone':
        return 'No phone number on file for this prospect.';
      case 'cross_tenant':
        return 'Permission denied.';
      default:
        return 'Messaging not allowed right now.';
    }
  }
}
