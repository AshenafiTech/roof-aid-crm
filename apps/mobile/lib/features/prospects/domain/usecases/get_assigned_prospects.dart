import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/prospect_entity.dart';
import '../repositories/prospect_repository.dart';

class GetAssignedProspects {
  final ProspectRepository repository;

  const GetAssignedProspects(this.repository);

  Future<Either<Failure, List<ProspectEntity>>> call() {
    return repository.getAssignedProspects();
  }
}
