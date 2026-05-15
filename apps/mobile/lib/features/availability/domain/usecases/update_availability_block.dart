import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/availability_block_entity.dart';
import '../repositories/availability_repository.dart';

class UpdateAvailabilityBlock {
  final AvailabilityRepository repository;

  const UpdateAvailabilityBlock(this.repository);

  Future<Either<Failure, AvailabilityBlockEntity>> call(
    String id,
    UpdateAvailabilityBlockInput input,
  ) {
    return repository.updateBlock(id, input);
  }
}
