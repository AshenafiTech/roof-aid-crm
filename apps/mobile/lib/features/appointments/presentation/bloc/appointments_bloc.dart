import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/usecases/get_my_appointments.dart';
import '../../domain/usecases/transition_appointment.dart';
import '../../domain/usecases/watch_my_appointments.dart';
import 'appointments_event.dart';
import 'appointments_state.dart';

class AppointmentsBloc extends Bloc<AppointmentsEvent, AppointmentsState> {
  final GetMyAppointments _get;
  final WatchMyAppointments _watch;
  final TransitionAppointment _transition;
  StreamSubscription? _subscription;

  AppointmentsBloc({
    required GetMyAppointments get,
    required WatchMyAppointments watch,
    required TransitionAppointment transition,
  })  : _get = get,
        _watch = watch,
        _transition = transition,
        super(const AppointmentsInitial()) {
    on<AppointmentsLoadRequested>(_onLoad);
    on<AppointmentsRefreshRequested>(_onRefresh);
    on<AppointmentsStreamUpdated>(_onStreamUpdated);
    on<AppointmentsStreamFailed>(_onStreamFailed);
    on<AppointmentTransitionRequested>(_onTransition);
  }

  Future<void> _onLoad(
    AppointmentsLoadRequested event,
    Emitter<AppointmentsState> emit,
  ) async {
    emit(const AppointmentsLoading());
    final result = await _get();
    result.fold(
      (failure) => emit(_errorFor(failure)),
      (list) {
        emit(AppointmentsLoaded(list));
        _subscribe();
      },
    );
  }

  Future<void> _onRefresh(
    AppointmentsRefreshRequested event,
    Emitter<AppointmentsState> emit,
  ) async {
    final result = await _get();
    result.fold(
      (failure) => emit(_errorFor(failure)),
      (list) => emit(AppointmentsLoaded(list)),
    );
  }

  void _onStreamUpdated(
    AppointmentsStreamUpdated event,
    Emitter<AppointmentsState> emit,
  ) {
    emit(AppointmentsLoaded(event.appointments));
  }

  void _onStreamFailed(
    AppointmentsStreamFailed event,
    Emitter<AppointmentsState> emit,
  ) {
    if (state is! AppointmentsLoaded) {
      final offline = isNetworkError(event.message);
      emit(AppointmentsError(
        offline ? offlineMessage : event.message,
        isOffline: offline,
      ));
    }
  }

  Future<void> _onTransition(
    AppointmentTransitionRequested event,
    Emitter<AppointmentsState> emit,
  ) async {
    final result = await _transition(
      appointmentId: event.appointmentId,
      to: event.to,
      reason: event.reason,
    );
    result.fold(
      (failure) {
        final current = state;
        if (current is AppointmentsLoaded) {
          emit(current.copyWith(lastError: () => failure.message));
        }
      },
      (_) {
        // Realtime will refresh; nothing to do here.
        final current = state;
        if (current is AppointmentsLoaded) {
          emit(current.copyWith(lastError: () => null));
        }
      },
    );
  }

  AppointmentsError _errorFor(Failure failure) {
    return AppointmentsError(
      failure.message,
      isOffline: failure is NetworkFailure,
    );
  }

  void _subscribe() {
    _subscription?.cancel();
    _subscription = _watch().listen(
      (list) => add(AppointmentsStreamUpdated(list)),
      onError: (Object e) => add(AppointmentsStreamFailed(e.toString())),
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
