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
  final EventController<_CalendarEvent> _controller =
      EventController<_CalendarEvent>();

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
    final events = <CalendarEventData<_CalendarEvent>>[];

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
        CalendarEventData<_CalendarEvent>(
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

  Iterable<CalendarEventData<_CalendarEvent>> _blockToEvents(
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
      yield CalendarEventData<_CalendarEvent>(
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

            return CalendarControllerProvider<_CalendarEvent>(
              controller: _controller,
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
            );
          },
        );
      },
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
    switch (mode) {
      case CalendarViewMode.day:
        return DayView<_CalendarEvent>(
          initialDay: cursor,
          startDuration: const Duration(hours: 6),
          showHalfHours: true,
          heightPerMinute: 1.4,
          showLiveTimeLineInAllDays: true,
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
        return WeekView<_CalendarEvent>(
          initialDay: cursor,
          startDay: WeekDays.sunday,
          startHour: 6,
          endHour: 22,
          heightPerMinute: 1.2,
          showLiveTimeLineInAllDays: true,
          onPageChange: (date, _) => context
              .read<CalendarBloc>()
              .add(CalendarCursorChanged(date)),
          onEventTap: (events, _) {
            if (events.isEmpty) return;
            _handleTap(context, events.first.event);
          },
        );
      case CalendarViewMode.month:
        return MonthView<_CalendarEvent>(
          monthViewStyle: MonthViewStyle(
            initialMonth: cursor,
            startDay: WeekDays.sunday,
          ),
          monthViewBuilders: MonthViewBuilders<_CalendarEvent>(
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

  void _handleTap(BuildContext context, _CalendarEvent? event) {
    if (event == null) return;
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
