import '../../domain/entities/sms_message_entity.dart';

class SmsMessageModel extends SmsMessageEntity {
  const SmsMessageModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.direction,
    required super.body,
    required super.sentAt,
    super.deliveryStatus,
    super.readAt,
    super.agentName,
  });

  /// Deserializes a row from `sms_logs`. The query should select:
  ///   `*, agent:users!agent_id(first_name, last_name)`
  /// so the agent display name is available without a second round-trip
  /// for outbound messages.
  factory SmsMessageModel.fromMap(Map<String, dynamic> map) {
    return SmsMessageModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      prospectId: map['prospect_id'] as String,
      direction: map['direction'] as String,
      body: (map['body'] as String?) ?? '',
      sentAt: _parseDate(map['sent_at']) ??
          _parseDate(map['created_at']) ??
          DateTime.now(),
      deliveryStatus: map['delivery_status'] as String?,
      readAt: _parseDate(map['read_at']),
      agentName: _parseAgentName(map['agent']),
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static String? _parseAgentName(dynamic agent) {
    if (agent is! Map) return null;
    final first = (agent['first_name'] as String?)?.trim();
    final last = (agent['last_name'] as String?)?.trim();
    final combined = [
      first,
      last,
    ].where((s) => s != null && s.isNotEmpty).join(' ');
    return combined.isEmpty ? null : combined;
  }
}
