import '../../domain/entities/availability_block_entity.dart';
import '../../domain/entities/working_hours_entity.dart';
import 'calendar_event.dart';

sealed class CalendarState {
  const CalendarState();
}

class CalendarInitial extends CalendarState {
  const CalendarInitial();
}

class CalendarLoading extends CalendarState {
  const CalendarLoading();
}

class CalendarLoaded extends CalendarState {
  final List<AvailabilityBlockEntity> blocks;
  final WorkingHoursEntity workingHours;
  final CalendarViewMode mode;
  final DateTime cursor;

  const CalendarLoaded({
    required this.blocks,
    required this.workingHours,
    required this.mode,
    required this.cursor,
  });

  CalendarLoaded copyWith({
    List<AvailabilityBlockEntity>? blocks,
    WorkingHoursEntity? workingHours,
    CalendarViewMode? mode,
    DateTime? cursor,
  }) {
    return CalendarLoaded(
      blocks: blocks ?? this.blocks,
      workingHours: workingHours ?? this.workingHours,
      mode: mode ?? this.mode,
      cursor: cursor ?? this.cursor,
    );
  }
}

class CalendarError extends CalendarState {
  final String message;
  final bool isOffline;
  const CalendarError(this.message, {this.isOffline = false});
}
