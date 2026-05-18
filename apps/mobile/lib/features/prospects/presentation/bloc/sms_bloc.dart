import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/entities/can_message_verdict.dart';
import '../../domain/usecases/check_can_message.dart';
import '../../domain/usecases/get_prospect_sms.dart';
import '../../domain/usecases/mark_prospect_sms_read.dart';
import '../../domain/usecases/send_prospect_sms.dart';
import '../../domain/usecases/watch_prospect_sms.dart';
import 'sms_event.dart';
import 'sms_state.dart';

class SmsBloc extends Bloc<SmsEvent, SmsState> {
  final GetProspectSms _getMessages;
  final WatchProspectSms _watchMessages;
  final SendProspectSms _sendMessage;
  final CheckCanMessage _checkCanMessage;
  final MarkProspectSmsRead _markRead;

  String? _prospectId;
  StreamSubscription? _subscription;
  int _submitErrorTick = 0;

  SmsBloc({
    required GetProspectSms getMessages,
    required WatchProspectSms watchMessages,
    required SendProspectSms sendMessage,
    required CheckCanMessage checkCanMessage,
    required MarkProspectSmsRead markRead,
  })  : _getMessages = getMessages,
        _watchMessages = watchMessages,
        _sendMessage = sendMessage,
        _checkCanMessage = checkCanMessage,
        _markRead = markRead,
        super(const SmsInitial()) {
    on<SmsLoadRequested>(_onLoad);
    on<SmsStreamUpdated>(_onStreamUpdated);
    on<SmsStreamFailed>(_onStreamFailed);
    on<SmsSendRequested>(_onSend);
    on<SmsVerdictRefreshRequested>(_onVerdictRefresh);
  }

  Future<void> _onLoad(
    SmsLoadRequested event,
    Emitter<SmsState> emit,
  ) async {
    _prospectId = event.prospectId;
    emit(const SmsLoading());

    final messagesResult = await _getMessages(event.prospectId);
    final verdictResult = await _checkCanMessage(event.prospectId);

    final failure = messagesResult.fold<Failure?>(
      (f) => f,
      (_) => verdictResult.fold<Failure?>((f) => f, (_) => null),
    );
    if (failure != null) {
      emit(_errorFor(failure));
      return;
    }

    final messages = messagesResult.getOrElse(() => []);
    final verdict = verdictResult.getOrElse(
      () => const CanMessageVerdict(allowed: false, reason: 'unknown'),
    );

    emit(SmsLoaded(messages: messages, verdict: verdict));
    _subscribe(event.prospectId);

    // Mark inbound messages as read in the background — fire-and-forget.
    unawaited(_markRead(event.prospectId));
  }

  void _onStreamUpdated(
    SmsStreamUpdated event,
    Emitter<SmsState> emit,
  ) {
    final current = state;
    if (current is SmsLoaded) {
      emit(current.copyWith(messages: event.messages));
      // New inbound messages → mark them read immediately since the user
      // is looking at the thread.
      if (_prospectId != null) {
        unawaited(_markRead(_prospectId!));
      }
    } else {
      // Realtime arrived before the initial load resolved — defer until the
      // proper SmsLoaded state lands.
    }
  }

  void _onStreamFailed(
    SmsStreamFailed event,
    Emitter<SmsState> emit,
  ) {
    if (state is! SmsLoaded) {
      final offline = isNetworkError(event.message);
      emit(
        SmsError(
          offline ? offlineMessage : event.message,
          isOffline: offline,
        ),
      );
    }
  }

  Future<void> _onSend(
    SmsSendRequested event,
    Emitter<SmsState> emit,
  ) async {
    final prospectId = _prospectId;
    final current = state;
    if (prospectId == null || current is! SmsLoaded) return;
    // `blocksUi` (not `!allowed`) lets DNC sends through — DNC is a warning
    // surfaced via the page-level DncBanner, not a block (client policy).
    if (current.verdict.blocksUi) return;
    final body = event.body.trim();
    if (body.isEmpty) return;

    emit(current.copyWith(isSubmitting: true, clearSubmitError: true));

    final result = await _sendMessage(prospectId: prospectId, body: body);
    result.fold(
      (failure) {
        final latest = state;
        if (latest is SmsLoaded) {
          emit(
            latest.copyWith(
              isSubmitting: false,
              submitError: failure.message,
              submitErrorTick: ++_submitErrorTick,
            ),
          );
        }
      },
      (sent) {
        // Optimistically prepend the queued row so the user sees it land
        // before the Realtime stream confirms. The stream's authoritative
        // refetch will replace it (matched by id) — no duplicate.
        final latest = state;
        if (latest is SmsLoaded) {
          final alreadyPresent = latest.messages.any((m) => m.id == sent.id);
          final merged = alreadyPresent
              ? latest.messages
              : [...latest.messages, sent];
          emit(
            latest.copyWith(
              messages: merged,
              isSubmitting: false,
              clearSubmitError: true,
            ),
          );
        }
      },
    );
  }

  Future<void> _onVerdictRefresh(
    SmsVerdictRefreshRequested event,
    Emitter<SmsState> emit,
  ) async {
    final prospectId = _prospectId;
    final current = state;
    if (prospectId == null || current is! SmsLoaded) return;

    final result = await _checkCanMessage(prospectId);
    result.fold(
      (_) {/* Keep prior verdict on transient failure */},
      (verdict) => emit(current.copyWith(verdict: verdict)),
    );
  }

  SmsError _errorFor(Failure failure) {
    return SmsError(
      failure.message,
      isOffline: failure is NetworkFailure,
    );
  }

  void _subscribe(String prospectId) {
    _subscription?.cancel();
    _subscription = _watchMessages(prospectId).listen(
      (messages) => add(SmsStreamUpdated(messages)),
      onError: (Object error) => add(SmsStreamFailed(error.toString())),
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
