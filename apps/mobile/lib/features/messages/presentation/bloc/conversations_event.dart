import '../../domain/entities/sms_conversation_entity.dart';

sealed class ConversationsEvent {
  const ConversationsEvent();
}

class ConversationsLoadRequested extends ConversationsEvent {
  const ConversationsLoadRequested();
}

class ConversationsStreamUpdated extends ConversationsEvent {
  final List<SmsConversationEntity> conversations;
  const ConversationsStreamUpdated(this.conversations);
}

class ConversationsStreamFailed extends ConversationsEvent {
  final String message;
  const ConversationsStreamFailed(this.message);
}
