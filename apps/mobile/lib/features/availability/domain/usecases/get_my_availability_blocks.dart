import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/availability_block_entity.dart';
import '../repositories/availability_repository.dart';

class GetMyAvailabilityBlocks {
  final AvailabilityRepository repository;

  const GetMyAvailabilityBlocks(this.repository);

  Future<Either<Failure, List<AvailabilityBlockEntity>>> call({
    DateTime? from,
    DateTime? to,
  }) {
    return repository.getMyBlocks(from: from, to: to);
  }
}
