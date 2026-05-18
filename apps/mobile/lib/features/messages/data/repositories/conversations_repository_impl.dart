import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/sms_conversation_entity.dart';
import '../../domain/repositories/conversations_repository.dart';
import '../datasources/conversations_remote_datasource.dart';

class ConversationsRepositoryImpl implements ConversationsRepository {
  final ConversationsRemoteDatasource remoteDatasource;

  const ConversationsRepositoryImpl(this.remoteDatasource);

  @override
  Future<Either<Failure, List<SmsConversationEntity>>> getConversations() async {
    try {
      final conversations = await remoteDatasource.fetchConversations();
      return Right(conversations);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<SmsConversationEntity>> watchConversations() {
    return remoteDatasource.watchConversations();
  }
}
