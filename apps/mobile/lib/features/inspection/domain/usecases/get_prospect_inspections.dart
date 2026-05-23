import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/inspection_entity.dart';
import '../repositories/inspection_repository.dart';

class GetProspectInspections {
  final InspectionRepository repository;

  const GetProspectInspections(this.repository);

  Future<Either<Failure, List<InspectionEntity>>> call(String prospectId) {
    return repository.getForProspect(prospectId);
  }
}
