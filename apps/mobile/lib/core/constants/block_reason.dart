/// Reasons a rufero may pick when creating an availability block.
///
/// Stored as the raw string in `rufero_availability_blocks.reason`.
/// Locked in `docs/milestone5/web-dependencies-for-mobile.md` §3.6.
class BlockReason {
  static const String sick = 'sick';
  static const String pto = 'pto';
  static const String office = 'office';
  static const String personal = 'personal';
  static const String other = 'other';

  static const List<String> all = [sick, pto, office, personal, other];

  static String label(String reason) {
    switch (reason) {
      case sick:
        return 'Sick';
      case pto:
        return 'PTO';
      case office:
        return 'Office';
      case personal:
        return 'Personal';
      case other:
        return 'Other';
      default:
        return reason;
    }
  }
}
