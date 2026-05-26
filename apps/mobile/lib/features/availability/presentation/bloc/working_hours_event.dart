import '../../domain/entities/working_hours_entity.dart';

sealed class WorkingHoursEvent {
  const WorkingHoursEvent();
}

class WorkingHoursLoadRequested extends WorkingHoursEvent {
  const WorkingHoursLoadRequested();
}

class WorkingHoursSubmitted extends WorkingHoursEvent {
  final WorkingHoursEntity hours;
  const WorkingHoursSubmitted(this.hours);
}

class WorkingHoursResetRequested extends WorkingHoursEvent {
  const WorkingHoursResetRequested();
}
