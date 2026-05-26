import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/usecases/get_my_availability_blocks.dart';
import '../../domain/usecases/get_my_working_hours.dart';
import '../../domain/usecases/watch_my_availability_blocks.dart';
import 'calendar_event.dart';
import 'calendar_state.dart';

class CalendarBloc extends Bloc<CalendarEvent, CalendarState> {
  final GetMyAvailabilityBlocks _getBlocks;
  final WatchMyAvailabilityBlocks _watchBlocks;
  final GetMyWorkingHours _getWorkingHours;
  StreamSubscription? _blocksSub;

  CalendarBloc({
    required GetMyAvailabilityBlocks getBlocks,
    required WatchMyAvailabilityBlocks watchBlocks,
    required GetMyWorkingHours getWorkingHours,
  })  : _getBlocks = getBlocks,
        _watchBlocks = watchBlocks,
        _getWorkingHours = getWorkingHours,
        super(const CalendarInitial()) {
    on<CalendarLoadRequested>(_onLoad);
    on<CalendarRefreshRequested>(_onRefresh);
    on<CalendarCursorChanged>(_onCursorChanged);
    on<CalendarViewModeChanged>(_onViewModeChanged);
    on<CalendarBlocksStreamUpdated>(_onStreamUpdated);
    on<CalendarBlocksStreamFailed>(_onStreamFailed);
    on<CalendarWorkingHoursLoaded>(_onWorkingHoursLoaded);
  }

  Future<void> _onLoad(
    CalendarLoadRequested event,
    Emitter<CalendarState> emit,
  ) async {
    emit(const CalendarLoading());

    final blocksResult = await _getBlocks();
    final hoursResult = await _getWorkingHours();

    final hours = hoursResult.fold((_) => null, (h) => h);
    if (hours == null) {
      final f = hoursResult.fold((f) => f, (_) => null);
      emit(CalendarError(
        f?.message ?? 'Failed to load working hours',
        isOffline: f is NetworkFailure,
      ));
      return;
    }

    blocksResult.fold(
      (failure) => emit(_errorFor(failure)),
      (blocks) {
        emit(CalendarLoaded(
          blocks: blocks,
          workingHours: hours,
          mode: CalendarViewMode.day,
          cursor: DateTime.now(),
        ));
        _subscribe();
      },
    );
  }

  Future<void> _onRefresh(
    CalendarRefreshRequested event,
    Emitter<CalendarState> emit,
  ) async {
    final current = state;
    if (current is! CalendarLoaded) {
      add(const CalendarLoadRequested());
      return;
    }
    final result = await _getBlocks();
    result.fold(
      (failure) => emit(_errorFor(failure)),
      (blocks) => emit(current.copyWith(blocks: blocks)),
    );
  }

  void _onCursorChanged(
    CalendarCursorChanged event,
    Emitter<CalendarState> emit,
  ) {
    final current = state;
    if (current is CalendarLoaded) {
      emit(current.copyWith(cursor: event.cursor));
    }
  }

  void _onViewModeChanged(
    CalendarViewModeChanged event,
    Emitter<CalendarState> emit,
  ) {
    final current = state;
    if (current is CalendarLoaded) {
      emit(current.copyWith(mode: event.mode));
    }
  }

  void _onStreamUpdated(
    CalendarBlocksStreamUpdated event,
    Emitter<CalendarState> emit,
  ) {
    final current = state;
    if (current is CalendarLoaded) {
      emit(current.copyWith(blocks: event.blocks));
    }
  }

  void _onStreamFailed(
    CalendarBlocksStreamFailed event,
    Emitter<CalendarState> emit,
  ) {
    if (state is! CalendarLoaded) {
      final offline = isNetworkError(event.message);
      emit(CalendarError(
        offline ? offlineMessage : event.message,
        isOffline: offline,
      ));
    }
  }

  void _onWorkingHoursLoaded(
    CalendarWorkingHoursLoaded event,
    Emitter<CalendarState> emit,
  ) {
    final current = state;
    if (current is CalendarLoaded) {
      emit(current.copyWith(workingHours: event.hours));
    }
  }

  CalendarError _errorFor(Failure failure) {
    return CalendarError(
      failure.message,
      isOffline: failure is NetworkFailure,
    );
  }

  void _subscribe() {
    _blocksSub?.cancel();
    _blocksSub = _watchBlocks().listen(
      (blocks) => add(CalendarBlocksStreamUpdated(blocks)),
      onError: (Object e) => add(CalendarBlocksStreamFailed(e.toString())),
    );
  }

  @override
  Future<void> close() {
    _blocksSub?.cancel();
    return super.close();
  }
}
