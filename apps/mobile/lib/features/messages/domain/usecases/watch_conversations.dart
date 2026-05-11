import '../entities/sms_conversation_entity.dart';
import '../repositories/conversations_repository.dart';

class WatchConversations {
  final ConversationsRepository repository;

  const WatchConversations(this.repository);

  Stream<List<SmsConversationEntity>> call() {
    return repository.watchConversations();
  }
}
