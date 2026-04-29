/// Verdict returned by the `can_message` RPC. Distinct from a generic Failure
/// because "you can't text this prospect" isn't an error state — it's a
/// business-rule outcome the UI renders informationally.
class CanMessageVerdict {
  final bool allowed;
  final String reason; // 'ok' | 'dnc' | 'no_phone' | 'cross_tenant' | 'not_found'

  const CanMessageVerdict({required this.allowed, required this.reason});

  factory CanMessageVerdict.fromMap(Map<String, dynamic> map) {
    return CanMessageVerdict(
      allowed: map['allowed'] == true,
      reason: (map['reason'] as String?) ?? 'unknown',
    );
  }

  /// Per client policy (M3-6 deviation), DNC is **advisory** — the agent is
  /// warned via the page-level DncBanner but is not prevented from sending.
  /// The agent takes responsibility. Other reasons (no phone, cross-tenant,
  /// not-found) still hard-block the composer.
  bool get blocksUi => !allowed && reason != 'dnc';

  /// User-facing copy for the disabled-composer notice. Only consulted when
  /// [blocksUi] is true.
  String get displayMessage {
    switch (reason) {
      case 'no_phone':
        return 'No phone number on file';
      case 'cross_tenant':
        return 'Permission denied';
      case 'not_found':
        return 'Prospect not found';
      case 'ok':
      case 'dnc':
        return '';
      default:
        return 'Messaging unavailable';
    }
  }
}
