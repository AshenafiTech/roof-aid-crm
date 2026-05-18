import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/sms_conversation_entity.dart';
import '../repositories/conversations_repository.dart';

class GetConversations {
  final ConversationsRepository repository;

  const GetConversations(this.repository);

  Future<Either<Failure, List<SmsConversationEntity>>> call() {
    return repository.getConversations();
  }
}
