/// A single SMS row attached to a prospect.
///
/// Mirrors the `sms_logs` table populated by the Telnyx webhook (inbound) and
/// the `send_sms` RPC (outbound). `agentName` is a denormalized display
/// value joined from `users` at fetch time, only present on outbound rows.
class SmsMessageEntity {
  final String id;
  final String tenantId;
  final String prospectId;
  final String direction; // 'inbound' | 'outbound'
  final String body;
  final String? deliveryStatus; // 'queued' | 'sent' | 'delivered' | 'failed' | 'received'
  final DateTime sentAt;
  final DateTime? readAt;
  final String? agentName;

  const SmsMessageEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.direction,
    required this.body,
    required this.sentAt,
    this.deliveryStatus,
    this.readAt,
    this.agentName,
  });

  bool get isOutbound => direction == 'outbound';
  bool get isInbound => direction == 'inbound';
  bool get isPending =>
      deliveryStatus == 'queued' || deliveryStatus == 'sent';
  bool get isDelivered => deliveryStatus == 'delivered';
  bool get isFailed => deliveryStatus == 'failed';
  bool get isUnread => isInbound && readAt == null;
}
