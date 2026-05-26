import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/availability_block_entity.dart';
import '../entities/working_hours_entity.dart';

abstract class AvailabilityRepository {
  /// Pull the current rufero's blocks in `[from, to]`. Returns master
  /// rows + their recurrence_rule; caller expands occurrences for render.
  Future<Either<Failure, List<AvailabilityBlockEntity>>> getMyBlocks({
    DateTime? from,
    DateTime? to,
  });

  /// Live stream of the current rufero's blocks. Re-fetches on every
  /// realtime change and on a slow safety-poll (catches RLS-blocked
  /// deletes the same way the prospects feature does).
  Stream<List<AvailabilityBlockEntity>> watchMyBlocks();

  Future<Either<Failure, AvailabilityBlockEntity>> createBlock(
    CreateAvailabilityBlockInput input,
  );

  Future<Either<Failure, AvailabilityBlockEntity>> updateBlock(
    String id,
    UpdateAvailabilityBlockInput input,
  );

  Future<Either<Failure, Unit>> deleteBlock(String id);

  /// Reads the current rufero's effective working hours.
  /// If the rufero hasn't customized them, returns the tenant default
  /// with `inherited = true`.
  Future<Either<Failure, WorkingHoursEntity>> getMyWorkingHours();

  /// Writes `users.working_hours`. Pass `null` for `hours` to reset to
  /// tenant inheritance.
  Future<Either<Failure, WorkingHoursEntity>> updateMyWorkingHours(
    WorkingHoursEntity? hours,
  );
}
