import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/usecases/get_my_working_hours.dart';
import '../../domain/usecases/update_my_working_hours.dart';
import 'working_hours_event.dart';
import 'working_hours_state.dart';

class WorkingHoursBloc extends Bloc<WorkingHoursEvent, WorkingHoursState> {
  final GetMyWorkingHours _get;
  final UpdateMyWorkingHours _update;

  WorkingHoursBloc({
    required GetMyWorkingHours get,
    required UpdateMyWorkingHours update,
  })  : _get = get,
        _update = update,
        super(const WorkingHoursInitial()) {
    on<WorkingHoursLoadRequested>(_onLoad);
    on<WorkingHoursSubmitted>(_onSubmit);
    on<WorkingHoursResetRequested>(_onReset);
  }

  Future<void> _onLoad(
    WorkingHoursLoadRequested event,
    Emitter<WorkingHoursState> emit,
  ) async {
    emit(const WorkingHoursLoading());
    final result = await _get();
    result.fold(
      (failure) => emit(WorkingHoursError(failure.message)),
      (hours) => emit(WorkingHoursLoaded(hours)),
    );
  }

  Future<void> _onSubmit(
    WorkingHoursSubmitted event,
    Emitter<WorkingHoursState> emit,
  ) async {
    final current = state;
    if (current is WorkingHoursLoaded) {
      emit(current.copyWith(isSaving: true));
    } else {
      emit(const WorkingHoursLoading());
    }
    final result = await _update(event.hours);
    result.fold(
      (failure) => emit(WorkingHoursError(failure.message)),
      (hours) => emit(WorkingHoursLoaded(hours)),
    );
  }

  Future<void> _onReset(
    WorkingHoursResetRequested event,
    Emitter<WorkingHoursState> emit,
  ) async {
    final current = state;
    if (current is WorkingHoursLoaded) {
      emit(current.copyWith(isSaving: true));
    }
    final result = await _update(null);
    result.fold(
      (failure) => emit(WorkingHoursError(failure.message)),
      (hours) => emit(WorkingHoursLoaded(hours)),
    );
  }
}
