import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/prospect_entity.dart';
import '../../domain/repositories/prospect_repository.dart';
import '../datasources/prospect_remote_datasource.dart';

class ProspectRepositoryImpl implements ProspectRepository {
  final ProspectRemoteDatasource remoteDatasource;

  const ProspectRepositoryImpl(this.remoteDatasource);

  @override
  Future<Either<Failure, List<ProspectEntity>>> getAssignedProspects() async {
    try {
      final prospects = await remoteDatasource.fetchAssigned();
      return Right(prospects);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<ProspectEntity>> watchAssignedProspects() {
    // Pass-through: models extend entities, so no cast needed.
    return remoteDatasource.watchAssigned();
  }
}
