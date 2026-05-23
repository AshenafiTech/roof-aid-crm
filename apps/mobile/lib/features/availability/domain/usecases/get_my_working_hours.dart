import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/working_hours_entity.dart';
import '../repositories/availability_repository.dart';

class GetMyWorkingHours {
  final AvailabilityRepository repository;

  const GetMyWorkingHours(this.repository);

  Future<Either<Failure, WorkingHoursEntity>> call() {
    return repository.getMyWorkingHours();
  }
}
