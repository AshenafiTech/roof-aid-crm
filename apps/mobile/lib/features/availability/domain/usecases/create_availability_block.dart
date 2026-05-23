import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/availability_block_entity.dart';
import '../repositories/availability_repository.dart';

class CreateAvailabilityBlock {
  final AvailabilityRepository repository;

  const CreateAvailabilityBlock(this.repository);

  Future<Either<Failure, AvailabilityBlockEntity>> call(
    CreateAvailabilityBlockInput input,
  ) {
    return repository.createBlock(input);
  }
}
