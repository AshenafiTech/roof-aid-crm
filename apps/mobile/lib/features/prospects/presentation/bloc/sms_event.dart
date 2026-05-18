import '../../domain/entities/sms_message_entity.dart';

sealed class SmsEvent {
  const SmsEvent();
}

class SmsLoadRequested extends SmsEvent {
  final String prospectId;

  const SmsLoadRequested(this.prospectId);
}

class SmsStreamUpdated extends SmsEvent {
  final List<SmsMessageEntity> messages;

  const SmsStreamUpdated(this.messages);
}

class SmsStreamFailed extends SmsEvent {
  final String message;

  const SmsStreamFailed(this.message);
}

class SmsSendRequested extends SmsEvent {
  final String body;

  const SmsSendRequested(this.body);
}

/// Re-runs `can_message` — used when the tab regains focus after a long
/// pause, or after the user reconnects from offline.
class SmsVerdictRefreshRequested extends SmsEvent {
  const SmsVerdictRefreshRequested();
}
