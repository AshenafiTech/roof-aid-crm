import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../../prospects/data/models/prospect_model.dart';
import '../../domain/entities/sms_conversation_entity.dart';

abstract class ConversationsRemoteDatasource {
  Future<List<SmsConversationEntity>> fetchConversations();
  Stream<List<SmsConversationEntity>> watchConversations();
}

/// Server-aggregated via `get_sms_conversations()` RPC (migration 024).
/// The RPC returns one jsonb per prospect with the latest message + unread
/// count, ordered by activity DESC. RLS on `sms_logs` and `prospects`
/// scopes the result to the caller's tenant.
class ConversationsRemoteDatasourceImpl implements ConversationsRemoteDatasource {
  final SupabaseClient client;

  const ConversationsRemoteDatasourceImpl(this.client);

  @override
  Future<List<SmsConversationEntity>> fetchConversations() async {
    _requireUser();

    try {
      final rows = await client.rpc('get_sms_conversations');
      return _parseRpcRows(rows as List);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      throw ServerException('Failed to load conversations: $e');
    }
  }

  @override
  Stream<List<SmsConversationEntity>> watchConversations() {
    if (client.auth.currentUser == null) return Stream.value(const []);

    final controller = StreamController<List<SmsConversationEntity>>();

    Future<void> refetch() async {
      try {
        final conversations = await fetchConversations();
        if (!controller.isClosed) controller.add(conversations);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    // One subscription for *all* sms_logs changes the caller can see. RLS
    // is the filter; any insert/update on a row in the caller's tenant
    // triggers a refetch.
    final channel = client
        .channel('sms_conversations_inbox')
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

  // ── RPC row parsing ─────────────────────────────────────────

  /// Maps each `get_sms_conversations()` row (a jsonb object) into the
  /// `SmsConversationEntity` the bloc and UI consume. The RPC already
  /// orders by `last_at DESC`, so no client-side sort is needed.
  List<SmsConversationEntity> _parseRpcRows(List rows) {
    final conversations = <SmsConversationEntity>[];

    for (final raw in rows) {
      if (raw is! Map) continue;
      final row = raw.cast<String, dynamic>();

      final prospectMap = row['prospect'];
      if (prospectMap is! Map) continue;
      final prospect = ProspectModel.fromMap(
        prospectMap.cast<String, dynamic>(),
      );

      final lastAt = _parseDate(row['last_at']) ?? DateTime.now();

      conversations.add(
        SmsConversationEntity(
          prospect: prospect,
          lastBody: (row['last_body'] as String?) ?? '',
          lastAt: lastAt,
          lastDirection: (row['last_direction'] as String?) ?? 'outbound',
          lastStatus: row['last_status'] as String?,
          unreadCount: (row['unread_count'] as num?)?.toInt() ?? 0,
        ),
      );
    }

    return conversations;
  }

  DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  void _requireUser() {
    if (client.auth.currentUser == null) {
      throw ServerException('Not authenticated');
    }
  }
}
