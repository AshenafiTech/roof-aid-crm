import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/availability_repository.dart';

class DeleteAvailabilityBlock {
  final AvailabilityRepository repository;

  const DeleteAvailabilityBlock(this.repository);

  Future<Either<Failure, Unit>> call(String id) {
    return repository.deleteBlock(id);
  }
}
