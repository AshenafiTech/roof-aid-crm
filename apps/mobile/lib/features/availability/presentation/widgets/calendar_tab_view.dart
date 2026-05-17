import 'package:calendar_view/calendar_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:rrule/rrule.dart' as rr;

import '../../../../core/constants/appointment_status.dart';
import '../../../../core/constants/availability_kind.dart';
import '../../../appointments/domain/entities/appointment_entity.dart';
import '../../../appointments/presentation/bloc/appointments_bloc.dart';
import '../../../appointments/presentation/bloc/appointments_state.dart';
import '../../domain/entities/availability_block_entity.dart';
import '../bloc/calendar_bloc.dart';
import '../bloc/calendar_event.dart';
import '../bloc/calendar_state.dart';
import '../pages/block_editor_page.dart';

/// Tagged event payload so the renderer knows whether a calendar cell is
/// an appointment, a busy block, or extra-availability.
sealed class _CalendarEvent {
  const _CalendarEvent();
}

class _AppointmentCalendarEvent extends _CalendarEvent {
  final AppointmentEntity appointment;
  const _AppointmentCalendarEvent(this.appointment);
}

class _BlockCalendarEvent extends _CalendarEvent {
  final AvailabilityBlockEntity block;
  const _BlockCalendarEvent(this.block);
}

class CalendarTabView extends StatefulWidget {
  const CalendarTabView({super.key});

  @override
  State<CalendarTabView> createState() => _CalendarTabViewState();
}

class _CalendarTabViewState extends State<CalendarTabView> {
  final EventController _controller =
      EventController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _syncEvents(
    List<AvailabilityBlockEntity> blocks,
    List<AppointmentEntity> appointments,
  ) {
    _controller.removeWhere((_) => true);
    final events = <CalendarEventData>[];

    // Window for which we expand recurrences. ±6 weeks around today is
    // plenty for the visible views; bigger windows hurt perf for nothing.
    final now = DateTime.now();
    final windowStart = now.subtract(const Duration(days: 42));
    final windowEnd = now.add(const Duration(days: 42));

    for (final block in blocks) {
      events.addAll(_blockToEvents(block, windowStart, windowEnd));
    }
    for (final a in appointments) {
      if (AppointmentStatus.terminal.contains(a.status)) continue;
      final color = AppointmentStatus.color(a.status);
      events.add(
        CalendarEventData(
          date: DateTime(a.scheduledAt.year, a.scheduledAt.month,
              a.scheduledAt.day),
          startTime: a.scheduledAt,
          endTime: a.endsAt,
          title: a.prospectName,
          description: a.displayAddress,
          color: color,
          event: _AppointmentCalendarEvent(a),
        ),
      );
    }
    _controller.addAll(events);
  }

  Iterable<CalendarEventData> _blockToEvents(
    AvailabilityBlockEntity block,
    DateTime windowStart,
    DateTime windowEnd,
  ) sync* {
    final color = block.kind == AvailabilityKind.busy
        ? const Color(0xFFEA580C)
        : const Color(0xFF16A34A);

    final occurrences = _expandRecurrence(block, windowStart, windowEnd);
    for (final occ in occurrences) {
      final start = occ;
      final end = start.add(block.duration);
      yield CalendarEventData(
        date: DateTime(start.year, start.month, start.day),
        startTime: start,
        endTime: end,
        title: block.kind == AvailabilityKind.busy
            ? (block.reason ?? 'Blocked')
            : 'Working',
        description: block.notes,
        color: color.withValues(alpha: 0.85),
        event: _BlockCalendarEvent(block),
      );
    }
  }

  List<DateTime> _expandRecurrence(
    AvailabilityBlockEntity block,
    DateTime windowStart,
    DateTime windowEnd,
  ) {
    if (block.recurrenceRule == null || block.recurrenceRule!.isEmpty) {
      if (block.endsAt.isBefore(windowStart) ||
          block.startsAt.isAfter(windowEnd)) {
        return const [];
      }
      return [block.startsAt];
    }

    try {
      final rule = rr.RecurrenceRule.fromString(
        'RRULE:${block.recurrenceRule!}',
      );
      final base = block.startsAt.toUtc();
      final instances = rule.getInstances(
        start: base,
        before: windowEnd.toUtc(),
      );
      return instances
          .where((dt) =>
              !dt.toLocal().isBefore(windowStart) &&
              !dt.toLocal().isAfter(windowEnd))
          .map((dt) => dt.toLocal())
          .toList();
    } catch (_) {
      // Fall back to a single occurrence if the rule fails to parse.
      return [block.startsAt];
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CalendarBloc, CalendarState>(
      builder: (context, calendarState) {
        return BlocBuilder<AppointmentsBloc, AppointmentsState>(
          builder: (context, apptState) {
            if (calendarState is CalendarLoading ||
                calendarState is CalendarInitial) {
              return const Center(child: CircularProgressIndicator());
            }
            if (calendarState is CalendarError) {
              return _ErrorView(
                message: calendarState.message,
                isOffline: calendarState.isOffline,
              );
            }
            final loaded = calendarState as CalendarLoaded;
            final appointments = apptState is AppointmentsLoaded
                ? apptState.appointments
                : const <AppointmentEntity>[];
            _syncEvents(loaded.blocks, appointments);

            return CalendarControllerProvider(
              controller: _controller,
              child: CalendarThemeProvider(
                calendarTheme: _calendarThemeFor(context),
                child: Column(
                  children: [
                    _ViewModeBar(mode: loaded.mode),
                    Expanded(
                      child: _ViewBody(
                        mode: loaded.mode,
                        cursor: loaded.cursor,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// Maps the app's [Theme] to a `calendar_view` theme so the calendar
  /// inherits the app's primary palette instead of the package's stock
  /// pink/white look. Light + dark both supported via `Theme.of`.
  CalendarThemeData _calendarThemeFor(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final hourLine = cs.outlineVariant;
    final halfLine = cs.outlineVariant.withValues(alpha: 0.4);
    final live = cs.error;
    final bg = cs.surface;
    final headerBg = cs.surfaceContainerHighest;
    final headerText = cs.onSurface;
    final timelineText = cs.onSurfaceVariant;

    return CalendarThemeData(
      monthViewTheme: MonthViewThemeData(
        cellInMonthColor: bg,
        cellNotInMonthColor: cs.surfaceContainerLowest,
        cellTextColor: cs.onSurface,
        cellBorderColor: cs.outlineVariant,
        weekDayTileColor: headerBg,
        weekDayTextColor: timelineText,
        weekDayBorderColor: cs.outlineVariant,
        headerIconColor: headerText,
        headerTextColor: headerText,
        headerBackgroundColor: headerBg,
        cellHighlightColor: cs.primary.withValues(alpha: 0.18),
      ),
      dayViewTheme: DayViewThemeData(
        hourLineColor: hourLine,
        halfHourLineColor: halfLine,
        quarterHourLineColor: halfLine,
        pageBackgroundColor: bg,
        liveIndicatorColor: live,
        headerIconColor: headerText,
        headerTextColor: headerText,
        headerBackgroundColor: headerBg,
        timelineTextColor: timelineText,
      ),
      weekViewTheme: WeekViewThemeData(
        weekDayTileColor: headerBg,
        weekDayTextColor: timelineText,
        hourLineColor: hourLine,
        halfHourLineColor: halfLine,
        quarterHourLineColor: halfLine,
        liveIndicatorColor: live,
        pageBackgroundColor: bg,
        headerIconColor: headerText,
        headerTextColor: headerText,
        headerBackgroundColor: headerBg,
        timelineTextColor: timelineText,
        borderColor: cs.outlineVariant,
        verticalLinesColor: cs.outlineVariant.withValues(alpha: 0.4),
      ),
      multiDayViewTheme: MultiDayViewThemeData(
        multiDayTileColor: headerBg,
        multiDayTextColor: timelineText,
        hourLineColor: hourLine,
        halfHourLineColor: halfLine,
        quarterHourLineColor: halfLine,
        liveIndicatorColor: live,
        pageBackgroundColor: bg,
        headerIconColor: headerText,
        headerTextColor: headerText,
        headerBackgroundColor: headerBg,
        timelineTextColor: timelineText,
        borderColor: cs.outlineVariant,
        verticalLinesColor: cs.outlineVariant.withValues(alpha: 0.4),
      ),
    );
  }
}

class _ViewModeBar extends StatelessWidget {
  final CalendarViewMode mode;
  const _ViewModeBar({required this.mode});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          SegmentedButton<CalendarViewMode>(
            segments: const [
              ButtonSegment(
                value: CalendarViewMode.day,
                label: Text('Day'),
                icon: Icon(Icons.view_day_outlined, size: 18),
              ),
              ButtonSegment(
                value: CalendarViewMode.week,
                label: Text('Week'),
                icon: Icon(Icons.view_week_outlined, size: 18),
              ),
              ButtonSegment(
                value: CalendarViewMode.month,
                label: Text('Month'),
                icon: Icon(Icons.calendar_month_outlined, size: 18),
              ),
            ],
            selected: {mode},
            showSelectedIcon: false,
            onSelectionChanged: (s) => context
                .read<CalendarBloc>()
                .add(CalendarViewModeChanged(s.first)),
          ),
        ],
      ),
    );
  }
}

class _ViewBody extends StatelessWidget {
  final CalendarViewMode mode;
  final DateTime cursor;
  const _ViewBody({required this.mode, required this.cursor});

  @override
  Widget build(BuildContext context) {
    // All views inherit the same color palette from the app theme. The
    // calendar_view package doesn't pull these from CalendarThemeProvider
    // automatically — settings classes + custom builders have to receive
    // them explicitly so labels stay readable in dark mode.
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final hourSettings = HourIndicatorSettings(
      color: cs.outlineVariant,
      height: 0.6,
    );
    final halfHourSettings = HourIndicatorSettings(
      color: cs.outlineVariant.withValues(alpha: 0.45),
      height: 0.5,
      lineStyle: LineStyle.dashed,
    );
    final liveSettings = LiveTimeIndicatorSettings(
      color: cs.error,
      showTime: true,
      showBullet: true,
    );

    switch (mode) {
      case CalendarViewMode.day:
        // Drop generics across the calendar_view widget tree: in v2 the
        // controller-provider lookup uses the (defaulted) Object? generic,
        // so generic mismatches at the MonthView level crash at runtime.
        return DayView(
          initialDay: cursor,
          startDuration: const Duration(hours: 6),
          showHalfHours: true,
          heightPerMinute: 1.4,
          showLiveTimeLineInAllDays: true,
          backgroundColor: cs.surface,
          hourIndicatorSettings: hourSettings,
          halfHourIndicatorSettings: halfHourSettings,
          liveTimeIndicatorSettings: liveSettings,
          dayTitleBuilder: (date) => _dayTitleBuilder(context, date),
          timeLineBuilder: (date) => _timelineBuilder(context, date),
          onPageChange: (date, _) => context
              .read<CalendarBloc>()
              .add(CalendarCursorChanged(date)),
          onEventTap: (events, _) {
            if (events.isEmpty) return;
            _handleTap(context, events.first.event);
          },
          onDateLongPress: (date) => _openEditor(context, prefill: date),
          onTimestampTap: (date) => _openEditor(context, prefill: date),
        );
      case CalendarViewMode.week:
        return WeekView(
          initialDay: cursor,
          startDay: WeekDays.sunday,
          startHour: 6,
          endHour: 22,
          heightPerMinute: 1.2,
          showLiveTimeLineInAllDays: true,
          backgroundColor: cs.surface,
          weekTitleBackgroundColor: cs.surfaceContainerHighest,
          hourIndicatorSettings: hourSettings,
          halfHourIndicatorSettings: halfHourSettings,
          liveTimeIndicatorSettings: liveSettings,
          timeLineBuilder: (date) => _timelineBuilder(context, date),
          weekDayBuilder: (date) => _weekDayBuilder(context, date),
          onPageChange: (date, _) => context
              .read<CalendarBloc>()
              .add(CalendarCursorChanged(date)),
          onEventTap: (events, _) {
            if (events.isEmpty) return;
            _handleTap(context, events.first.event);
          },
        );
      case CalendarViewMode.month:
        return MonthView(
          monthViewStyle: MonthViewStyle(
            initialMonth: cursor,
            startDay: WeekDays.sunday,
            borderColor: cs.outlineVariant,
            borderSize: 0.6,
          ),
          monthViewBuilders: MonthViewBuilders(
            cellBuilder: (date, events, isToday, isInMonth, hideDaysNotInMonth) =>
                _monthCellBuilder(
              context,
              date: date,
              events: events,
              isToday: isToday,
              isInMonth: isInMonth,
              hideDaysNotInMonth: hideDaysNotInMonth,
            ),
            weekDayBuilder: (day) => _monthWeekDayBuilder(context, day),
            headerBuilder: (date) => _monthHeaderBuilder(context, date),
            onPageChange: (date, _) => context
                .read<CalendarBloc>()
                .add(CalendarCursorChanged(date)),
            onCellTap: (events, date) {
              context.read<CalendarBloc>().add(CalendarCursorChanged(date));
              context
                  .read<CalendarBloc>()
                  .add(const CalendarViewModeChanged(CalendarViewMode.day));
            },
          ),
        );
    }
  }

  // ── Theme-aware builders ───────────────────────────────────

  Widget _timelineBuilder(BuildContext context, DateTime date) {
    final theme = Theme.of(context);
    // Skip the 00:00 row on the day grid edges; the package draws hours
    // every full hour and shows the leading midnight even when off-screen.
    final label = date.minute == 0
        ? DateFormat.j().format(date)
        : DateFormat.Hm().format(date);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Text(
        label,
        textAlign: TextAlign.right,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }

  Widget _dayTitleBuilder(BuildContext context, DateTime date) {
    final theme = Theme.of(context);
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      child: Text(
        DateFormat.yMMMMEEEEd().format(date),
        style: theme.textTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: theme.colorScheme.onSurface,
        ),
      ),
    );
  }

  Widget _weekDayBuilder(BuildContext context, DateTime date) {
    final theme = Theme.of(context);
    final isToday = _isSameDay(date, DateTime.now());
    // The week-title slot is only ~38 px tall in the v2 package layout,
    // so the column must size to its children + every pixel counts.
    return Container(
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            DateFormat.E().format(date).toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 10,
              height: 1.0,
              color: theme.colorScheme.onSurfaceVariant,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 2),
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isToday ? theme.colorScheme.primary : null,
            ),
            child: Text(
              date.day.toString(),
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                height: 1.0,
                fontWeight: FontWeight.w700,
                color: isToday
                    ? theme.colorScheme.onPrimary
                    : theme.colorScheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _monthCellBuilder(
    BuildContext context, {
    required DateTime date,
    required List<CalendarEventData> events,
    required bool isToday,
    required bool isInMonth,
    required bool hideDaysNotInMonth,
  }) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final visible = isInMonth || !hideDaysNotInMonth;
    final textColor = !visible
        ? Colors.transparent
        : isInMonth
            ? cs.onSurface
            : cs.onSurfaceVariant.withValues(alpha: 0.45);

    return Container(
      decoration: BoxDecoration(
        color: isInMonth ? cs.surface : cs.surfaceContainerLowest,
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.6),
          width: 0.5,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Day number — circled when today.
          Align(
            alignment: Alignment.topLeft,
            child: Container(
              width: 24,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isToday ? cs.primary : null,
              ),
              child: Text(
                date.day.toString(),
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: isToday ? cs.onPrimary : textColor,
                ),
              ),
            ),
          ),
          const SizedBox(height: 2),
          // Up to 3 event chips per cell — the rest collapses into "+N".
          if (visible && events.isNotEmpty)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final e in events.take(3))
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: e.color,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  if (events.length > 3)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '+${events.length - 3}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _monthWeekDayBuilder(BuildContext context, int day) {
    // `day` here is 0..6 in the order chosen by `startDay` (Sunday).
    const labels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surfaceContainerHighest,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        labels[day % labels.length],
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          letterSpacing: 1.0,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _monthHeaderBuilder(BuildContext context, DateTime date) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.chevron_left, color: theme.colorScheme.onSurface),
            onPressed: () {
              final prev = DateTime(date.year, date.month - 1, 1);
              context.read<CalendarBloc>().add(CalendarCursorChanged(prev));
            },
          ),
          Expanded(
            child: Text(
              DateFormat.yMMMM().format(date),
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.chevron_right, color: theme.colorScheme.onSurface),
            onPressed: () {
              final next = DateTime(date.year, date.month + 1, 1);
              context.read<CalendarBloc>().add(CalendarCursorChanged(next));
            },
          ),
        ],
      ),
    );
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  // calendar_view's controller-lookup defaults to <Object?>, so events
  // come back to us untyped. Cast back to our sealed payload.
  void _handleTap(BuildContext context, Object? raw) {
    if (raw is! _CalendarEvent) return;
    final event = raw;
    if (event is _AppointmentCalendarEvent) {
      // Bubble up via the parent (CalendarPage handles opening the
      // appointment detail sheet). For now, surface a toast — the List
      // tab is the primary surface for appointment actions.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${DateFormat.jm().format(event.appointment.scheduledAt)} · ${event.appointment.prospectName}',
          ),
        ),
      );
    } else if (event is _BlockCalendarEvent) {
      _openEditor(context, existing: event.block);
    }
  }

  Future<void> _openEditor(
    BuildContext context, {
    DateTime? prefill,
    AvailabilityBlockEntity? existing,
  }) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BlockEditorPage(
          existing: existing,
          initialStart: prefill,
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final bool isOffline;
  const _ErrorView({required this.message, required this.isOffline});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOffline ? Icons.cloud_off_outlined : Icons.error_outline,
              size: 48,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => context
                  .read<CalendarBloc>()
                  .add(const CalendarLoadRequested()),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
