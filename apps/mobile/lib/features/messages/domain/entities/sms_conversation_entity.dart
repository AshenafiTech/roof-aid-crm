import '../../../prospects/domain/entities/prospect_entity.dart';

/// One row in the inbox-style Messages tab: a single prospect's most recent
/// SMS plus an unread-inbound count for the badge.
///
/// Carries enough of the prospect's data (`prospect`) to navigate into the
/// existing `ProspectDetailPage` on tap without an extra fetch.
class SmsConversationEntity {
  final ProspectEntity prospect;
  final String lastBody;
  final DateTime lastAt;
  final String lastDirection; // 'inbound' | 'outbound'
  final String? lastStatus; // 'queued' | 'sent' | 'delivered' | 'failed' | 'received'
  final int unreadCount;

  const SmsConversationEntity({
    required this.prospect,
    required this.lastBody,
    required this.lastAt,
    required this.lastDirection,
    required this.unreadCount,
    this.lastStatus,
  });

  bool get hasUnread => unreadCount > 0;
  bool get isLastOutbound => lastDirection == 'outbound';
}
