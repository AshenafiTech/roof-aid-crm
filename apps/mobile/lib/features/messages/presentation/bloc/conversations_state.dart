import '../../domain/entities/sms_conversation_entity.dart';

sealed class ConversationsState {
  const ConversationsState();
}

class ConversationsInitial extends ConversationsState {
  const ConversationsInitial();
}

class ConversationsLoading extends ConversationsState {
  const ConversationsLoading();
}

class ConversationsLoaded extends ConversationsState {
  final List<SmsConversationEntity> conversations;
  const ConversationsLoaded(this.conversations);
}

class ConversationsError extends ConversationsState {
  final String message;
  final bool isOffline;
  const ConversationsError(this.message, {this.isOffline = false});
}
