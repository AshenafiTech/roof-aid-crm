import '../../domain/entities/can_message_verdict.dart';
import '../../domain/entities/sms_message_entity.dart';

sealed class SmsState {
  const SmsState();
}

class SmsInitial extends SmsState {
  const SmsInitial();
}

class SmsLoading extends SmsState {
  const SmsLoading();
}

/// Conversation has been loaded. `verdict` drives the composer's enabled
/// state and the displayed notice when it's blocked. `submitError` is
/// shown above the composer; `submitErrorTick` lets the UI distinguish
/// repeated identical errors so it can re-show the banner.
class SmsLoaded extends SmsState {
  final List<SmsMessageEntity> messages;
  final CanMessageVerdict verdict;
  final bool isSubmitting;
  final String? submitError;
  final int submitErrorTick;

  const SmsLoaded({
    required this.messages,
    required this.verdict,
    this.isSubmitting = false,
    this.submitError,
    this.submitErrorTick = 0,
  });

  SmsLoaded copyWith({
    List<SmsMessageEntity>? messages,
    CanMessageVerdict? verdict,
    bool? isSubmitting,
    String? submitError,
    bool clearSubmitError = false,
    int? submitErrorTick,
  }) {
    return SmsLoaded(
      messages: messages ?? this.messages,
      verdict: verdict ?? this.verdict,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      submitError:
          clearSubmitError ? null : (submitError ?? this.submitError),
      submitErrorTick: submitErrorTick ?? this.submitErrorTick,
    );
  }
}

class SmsError extends SmsState {
  final String message;
  final bool isOffline;

  const SmsError(this.message, {this.isOffline = false});
}
