import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/can_message_verdict.dart';
import '../../domain/entities/sms_message_entity.dart';
import '../../domain/repositories/sms_repository.dart';
import '../datasources/sms_remote_datasource.dart';

class SmsRepositoryImpl implements SmsRepository {
  final SmsRemoteDatasource remoteDatasource;

  const SmsRepositoryImpl(this.remoteDatasource);

  @override
  Future<Either<Failure, List<SmsMessageEntity>>> getMessages(
    String prospectId,
  ) async {
    try {
      final messages = await remoteDatasource.fetchForProspect(prospectId);
      return Right(messages);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<SmsMessageEntity>> watchMessages(String prospectId) {
    return remoteDatasource.watchForProspect(prospectId);
  }

  @override
  Future<Either<Failure, SmsMessageEntity>> sendMessage({
    required String prospectId,
    required String body,
  }) async {
    try {
      final message = await remoteDatasource.sendMessage(
        prospectId: prospectId,
        body: body,
      );
      return Right(message);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, CanMessageVerdict>> checkCanMessage(
    String prospectId,
  ) async {
    try {
      final verdict = await remoteDatasource.checkCanMessage(prospectId);
      return Right(verdict);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> markAsRead(String prospectId) async {
    try {
      await remoteDatasource.markRead(prospectId);
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
