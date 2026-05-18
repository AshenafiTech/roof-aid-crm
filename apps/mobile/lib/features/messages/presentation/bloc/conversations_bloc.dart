import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/usecases/get_conversations.dart';
import '../../domain/usecases/watch_conversations.dart';
import 'conversations_event.dart';
import 'conversations_state.dart';

class ConversationsBloc extends Bloc<ConversationsEvent, ConversationsState> {
  final GetConversations _getConversations;
  final WatchConversations _watchConversations;

  StreamSubscription? _subscription;

  ConversationsBloc({
    required GetConversations getConversations,
    required WatchConversations watchConversations,
  })  : _getConversations = getConversations,
        _watchConversations = watchConversations,
        super(const ConversationsInitial()) {
    on<ConversationsLoadRequested>(_onLoad);
    on<ConversationsStreamUpdated>(_onStreamUpdated);
    on<ConversationsStreamFailed>(_onStreamFailed);
  }

  Future<void> _onLoad(
    ConversationsLoadRequested event,
    Emitter<ConversationsState> emit,
  ) async {
    emit(const ConversationsLoading());

    final result = await _getConversations();
    result.fold(
      (failure) => emit(_errorFor(failure)),
      (conversations) {
        emit(ConversationsLoaded(conversations));
        _subscribe();
      },
    );
  }

  void _onStreamUpdated(
    ConversationsStreamUpdated event,
    Emitter<ConversationsState> emit,
  ) {
    emit(ConversationsLoaded(event.conversations));
  }

  void _onStreamFailed(
    ConversationsStreamFailed event,
    Emitter<ConversationsState> emit,
  ) {
    if (state is! ConversationsLoaded) {
      final offline = isNetworkError(event.message);
      emit(
        ConversationsError(
          offline ? offlineMessage : event.message,
          isOffline: offline,
        ),
      );
    }
  }

  void _subscribe() {
    _subscription?.cancel();
    _subscription = _watchConversations().listen(
      (conversations) => add(ConversationsStreamUpdated(conversations)),
      onError: (Object error) => add(ConversationsStreamFailed(error.toString())),
    );
  }

  ConversationsError _errorFor(Failure failure) {
    return ConversationsError(
      failure.message,
      isOffline: failure is NetworkFailure,
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
