/// Recurrence presets supported by the block editor in M5.
///
/// The DB column `rufero_availability_blocks.recurrence_rule` stores an
/// iCal RRULE string (or null). M5 ships only these three presets — the
/// custom-rule editor lands in M7+. The renderer must still accept any
/// valid RRULE the DB serves back, even if we don't write it.
///
/// Locked in `docs/milestone5/web-dependencies-for-mobile.md` §3.6.
enum RecurrencePreset {
  none,
  everyWeekday,
  weeklyOnDay;

  String label({int? weekdayIso}) {
    switch (this) {
      case RecurrencePreset.none:
        return 'Does not repeat';
      case RecurrencePreset.everyWeekday:
        return 'Every weekday (Mon–Fri)';
      case RecurrencePreset.weeklyOnDay:
        return weekdayIso == null
            ? 'Weekly on this day'
            : 'Weekly on ${_weekdayName(weekdayIso)}';
    }
  }

  /// Returns the iCal RRULE string this preset stores in the DB.
  /// `weekdayIso` is 1=Mon … 7=Sun (DateTime.weekday).
  String? toRRule({int? weekdayIso}) {
    switch (this) {
      case RecurrencePreset.none:
        return null;
      case RecurrencePreset.everyWeekday:
        return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
      case RecurrencePreset.weeklyOnDay:
        if (weekdayIso == null) return null;
        return 'FREQ=WEEKLY;BYDAY=${_byDay(weekdayIso)}';
    }
  }

  /// Best-effort reverse mapping for editing an existing block.
  /// Returns `none` for unknown / custom rules.
  static RecurrencePreset fromRRule(String? rrule) {
    if (rrule == null || rrule.isEmpty) return RecurrencePreset.none;
    final upper = rrule.toUpperCase();
    if (upper.contains('BYDAY=MO,TU,WE,TH,FR')) {
      return RecurrencePreset.everyWeekday;
    }
    if (upper.startsWith('FREQ=WEEKLY') && upper.contains('BYDAY=')) {
      return RecurrencePreset.weeklyOnDay;
    }
    return RecurrencePreset.none;
  }

  static String _byDay(int weekdayIso) {
    switch (weekdayIso) {
      case DateTime.monday:
        return 'MO';
      case DateTime.tuesday:
        return 'TU';
      case DateTime.wednesday:
        return 'WE';
      case DateTime.thursday:
        return 'TH';
      case DateTime.friday:
        return 'FR';
      case DateTime.saturday:
        return 'SA';
      case DateTime.sunday:
        return 'SU';
      default:
        return 'MO';
    }
  }

  static String _weekdayName(int weekdayIso) {
    switch (weekdayIso) {
      case DateTime.monday:
        return 'Monday';
      case DateTime.tuesday:
        return 'Tuesday';
      case DateTime.wednesday:
        return 'Wednesday';
      case DateTime.thursday:
        return 'Thursday';
      case DateTime.friday:
        return 'Friday';
      case DateTime.saturday:
        return 'Saturday';
      case DateTime.sunday:
        return 'Sunday';
      default:
        return 'this day';
    }
  }
}
