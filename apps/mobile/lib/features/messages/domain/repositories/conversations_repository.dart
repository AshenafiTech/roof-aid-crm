import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/sms_conversation_entity.dart';

abstract class ConversationsRepository {
  Future<Either<Failure, List<SmsConversationEntity>>> getConversations();
  Stream<List<SmsConversationEntity>> watchConversations();
}
