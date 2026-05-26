import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/inspection_entity.dart';
import '../repositories/inspection_repository.dart';

class MarkInspectionComplete {
  final InspectionRepository repository;

  const MarkInspectionComplete(this.repository);

  Future<Either<Failure, InspectionEntity>> call(String inspectionId) {
    return repository.markComplete(inspectionId);
  }
}
