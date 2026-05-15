/// Per-rufero or tenant-default working hours.
///
/// JSON shape on the DB:
/// ```
/// {
///   "mon": { "start": "08:00", "end": "17:00" },
///   "tue": { "start": "08:00", "end": "17:00" },
///   "wed": null,                  // day off
///   ...
/// }
/// ```
///
/// A null value at the column level (NOT here) means "inherit tenant default."
/// We represent that as `WorkingHoursEntity.inherited = true`.
class WorkingHoursEntity {
  static const _dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  /// True when the rufero hasn't set a personal override; values come
  /// from the tenant default in this case.
  final bool inherited;

  /// One entry per day key. Null means the rufero is OFF that day.
  final Map<String, DayWindow?> byDay;

  const WorkingHoursEntity({
    required this.inherited,
    required this.byDay,
  });

  DayWindow? windowFor(int weekdayIso) {
    return byDay[_dayKeys[weekdayIso - 1]];
  }

  static List<String> get orderedDayKeys => _dayKeys;

  WorkingHoursEntity copyWith({
    bool? inherited,
    Map<String, DayWindow?>? byDay,
  }) {
    return WorkingHoursEntity(
      inherited: inherited ?? this.inherited,
      byDay: byDay ?? this.byDay,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      for (final k in _dayKeys) k: byDay[k]?.toJson(),
    };
  }

  factory WorkingHoursEntity.fromJson(
    Map<String, dynamic>? json, {
    required bool inherited,
  }) {
    if (json == null) {
      return WorkingHoursEntity(
        inherited: inherited,
        byDay: {for (final k in _dayKeys) k: null},
      );
    }
    return WorkingHoursEntity(
      inherited: inherited,
      byDay: {
        for (final k in _dayKeys)
          k: json[k] == null ? null : DayWindow.fromJson(json[k] as Map<String, dynamic>),
      },
    );
  }

  /// Standard 9-to-5 across weekdays, weekends off — used as the form
  /// default when a rufero clicks "Customize" on a fully-inherited card.
  factory WorkingHoursEntity.defaults() {
    const std = DayWindow(start: '08:00', end: '17:00');
    return const WorkingHoursEntity(
      inherited: false,
      byDay: {
        'mon': std,
        'tue': std,
        'wed': std,
        'thu': std,
        'fri': std,
        'sat': null,
        'sun': null,
      },
    );
  }
}

class DayWindow {
  /// 'HH:mm' in tenant local time.
  final String start;
  final String end;

  const DayWindow({required this.start, required this.end});

  Map<String, String> toJson() => {'start': start, 'end': end};

  factory DayWindow.fromJson(Map<String, dynamic> json) {
    return DayWindow(
      start: json['start'] as String,
      end: json['end'] as String,
    );
  }
}
