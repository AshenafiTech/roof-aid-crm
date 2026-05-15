import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/working_hours_entity.dart';
import '../repositories/availability_repository.dart';

class UpdateMyWorkingHours {
  final AvailabilityRepository repository;

  const UpdateMyWorkingHours(this.repository);

  /// Pass null to reset to tenant inheritance.
  Future<Either<Failure, WorkingHoursEntity>> call(WorkingHoursEntity? hours) {
    return repository.updateMyWorkingHours(hours);
  }
}
