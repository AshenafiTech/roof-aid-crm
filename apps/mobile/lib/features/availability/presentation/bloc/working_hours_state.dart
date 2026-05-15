import '../../domain/entities/working_hours_entity.dart';

sealed class WorkingHoursState {
  const WorkingHoursState();
}

class WorkingHoursInitial extends WorkingHoursState {
  const WorkingHoursInitial();
}

class WorkingHoursLoading extends WorkingHoursState {
  const WorkingHoursLoading();
}

class WorkingHoursLoaded extends WorkingHoursState {
  final WorkingHoursEntity hours;
  final bool isSaving;
  const WorkingHoursLoaded(this.hours, {this.isSaving = false});

  WorkingHoursLoaded copyWith({
    WorkingHoursEntity? hours,
    bool? isSaving,
  }) {
    return WorkingHoursLoaded(
      hours ?? this.hours,
      isSaving: isSaving ?? this.isSaving,
    );
  }
}

class WorkingHoursError extends WorkingHoursState {
  final String message;
  const WorkingHoursError(this.message);
}
