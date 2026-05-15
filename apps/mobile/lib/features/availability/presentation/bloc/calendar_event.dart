import '../../domain/entities/availability_block_entity.dart';
import '../../domain/entities/working_hours_entity.dart';

enum CalendarViewMode { day, week, month }

sealed class CalendarEvent {
  const CalendarEvent();
}

class CalendarLoadRequested extends CalendarEvent {
  const CalendarLoadRequested();
}

class CalendarRefreshRequested extends CalendarEvent {
  const CalendarRefreshRequested();
}

class CalendarCursorChanged extends CalendarEvent {
  final DateTime cursor;
  const CalendarCursorChanged(this.cursor);
}

class CalendarViewModeChanged extends CalendarEvent {
  final CalendarViewMode mode;
  const CalendarViewModeChanged(this.mode);
}

class CalendarBlocksStreamUpdated extends CalendarEvent {
  final List<AvailabilityBlockEntity> blocks;
  const CalendarBlocksStreamUpdated(this.blocks);
}

class CalendarBlocksStreamFailed extends CalendarEvent {
  final String message;
  const CalendarBlocksStreamFailed(this.message);
}

class CalendarWorkingHoursLoaded extends CalendarEvent {
  final WorkingHoursEntity hours;
  const CalendarWorkingHoursLoaded(this.hours);
}
