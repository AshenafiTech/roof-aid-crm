/// Availability-block kinds as stored in `rufero_availability_blocks.kind`.
///
/// - `busy` (default): the rufero is NOT bookable during this range.
///   `can_schedule()` returns `overlap_with_block` for any slot inside.
/// - `availableExtra`: the rufero IS bookable during this range even if
///   it falls outside their normal working hours.
class AvailabilityKind {
  static const String busy = 'busy';
  static const String availableExtra = 'available_extra';

  static const List<String> all = [busy, availableExtra];

  static String label(String kind) {
    switch (kind) {
      case busy:
        return 'Blocked';
      case availableExtra:
        return 'Working';
      default:
        return kind;
    }
  }
}
