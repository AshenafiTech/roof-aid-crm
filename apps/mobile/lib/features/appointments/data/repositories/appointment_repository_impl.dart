import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/appointment_entity.dart';
import '../../domain/repositories/appointment_repository.dart';
import '../datasources/appointment_remote_datasource.dart';

class AppointmentRepositoryImpl implements AppointmentRepository {
  final AppointmentRemoteDatasource remote;

  const AppointmentRepositoryImpl(this.remote);

  @override
  Future<Either<Failure, List<AppointmentEntity>>> getMyAppointments({
    DateTime? from,
    DateTime? to,
  }) async {
    try {
      final list = await remote.fetchMine(from: from, to: to);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<AppointmentEntity>> watchMyAppointments() => remote.watchMine();

  @override
  Future<Either<Failure, Unit>> transition({
    required String appointmentId,
    required String to,
    String? reason,
  }) async {
    try {
      await remote.transition(
        appointmentId: appointmentId,
        to: to,
        reason: reason,
      );
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
