import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/usecases/get_assigned_prospects.dart';
import '../../domain/usecases/watch_assigned_prospects.dart';
import 'prospects_event.dart';
import 'prospects_state.dart';

class ProspectsBloc extends Bloc<ProspectsEvent, ProspectsState> {
  final GetAssignedProspects _getAssigned;
  final WatchAssignedProspects _watchAssigned;
  StreamSubscription? _subscription;

  ProspectsBloc({
    required GetAssignedProspects getAssigned,
    required WatchAssignedProspects watchAssigned,
  }) : _getAssigned = getAssigned,
       _watchAssigned = watchAssigned,
       super(const ProspectsInitial()) {
    on<ProspectsLoadRequested>(_onLoad);
    on<ProspectsRefreshRequested>(_onRefresh);
    on<ProspectsStreamUpdated>(_onStreamUpdated);
    on<ProspectsStreamFailed>(_onStreamFailed);
  }

  Future<void> _onLoad(
    ProspectsLoadRequested event,
    Emitter<ProspectsState> emit,
  ) async {
    emit(const ProspectsLoading());

    final result = await _getAssigned();

    result.fold(
      (failure) => emit(_errorFor(failure)),
      (prospects) {
        emit(ProspectsLoaded(prospects));
        _subscribe();
      },
    );
  }

  Future<void> _onRefresh(
    ProspectsRefreshRequested event,
    Emitter<ProspectsState> emit,
  ) async {
    final result = await _getAssigned();

    result.fold(
      (failure) => emit(_errorFor(failure)),
      (prospects) => emit(ProspectsLoaded(prospects)),
    );
  }

  void _onStreamUpdated(
    ProspectsStreamUpdated event,
    Emitter<ProspectsState> emit,
  ) {
    emit(ProspectsLoaded(event.prospects));
  }

  void _onStreamFailed(
    ProspectsStreamFailed event,
    Emitter<ProspectsState> emit,
  ) {
    // Don't wipe the current list on a realtime error — just surface
    // the message via a transient error state if we're not already loaded.
    if (state is! ProspectsLoaded) {
      // Stream errors come through as raw exceptions stringified into
      // `event.message`, not as Failures — sniff for the network shape so
      // the UI can render an offline icon.
      final offline = isNetworkError(event.message);
      emit(
        ProspectsError(
          offline ? offlineMessage : event.message,
          isOffline: offline,
        ),
      );
    }
  }

  ProspectsError _errorFor(Failure failure) {
    return ProspectsError(
      failure.message,
      isOffline: failure is NetworkFailure,
    );
  }

  void _subscribe() {
    _subscription?.cancel();
    _subscription = _watchAssigned().listen(
      (prospects) => add(ProspectsStreamUpdated(prospects)),
      onError: (Object error) => add(ProspectsStreamFailed(error.toString())),
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
