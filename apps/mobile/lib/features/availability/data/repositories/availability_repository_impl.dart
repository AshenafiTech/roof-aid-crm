import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/availability_block_entity.dart';
import '../../domain/entities/working_hours_entity.dart';
import '../../domain/repositories/availability_repository.dart';
import '../datasources/availability_remote_datasource.dart';

class AvailabilityRepositoryImpl implements AvailabilityRepository {
  final AvailabilityRemoteDatasource remote;

  const AvailabilityRepositoryImpl(this.remote);

  @override
  Future<Either<Failure, List<AvailabilityBlockEntity>>> getMyBlocks({
    DateTime? from,
    DateTime? to,
  }) async {
    try {
      final list = await remote.fetchMyBlocks(from: from, to: to);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<AvailabilityBlockEntity>> watchMyBlocks() => remote.watchMyBlocks();

  @override
  Future<Either<Failure, AvailabilityBlockEntity>> createBlock(
    CreateAvailabilityBlockInput input,
  ) async {
    try {
      final block = await remote.create(input);
      return Right(block);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, AvailabilityBlockEntity>> updateBlock(
    String id,
    UpdateAvailabilityBlockInput input,
  ) async {
    try {
      final block = await remote.update(id, input);
      return Right(block);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> deleteBlock(String id) async {
    try {
      await remote.delete(id);
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, WorkingHoursEntity>> getMyWorkingHours() async {
    try {
      final hours = await remote.fetchMyWorkingHours();
      return Right(hours);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, WorkingHoursEntity>> updateMyWorkingHours(
    WorkingHoursEntity? hours,
  ) async {
    try {
      final updated = await remote.updateMyWorkingHours(hours);
      return Right(updated);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
