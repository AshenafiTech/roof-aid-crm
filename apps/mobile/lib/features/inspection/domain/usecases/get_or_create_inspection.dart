import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/inspection_entity.dart';
import '../repositories/inspection_repository.dart';

class GetOrCreateInspection {
  final InspectionRepository repository;

  const GetOrCreateInspection(this.repository);

  Future<Either<Failure, InspectionEntity>> call({
    required String appointmentId,
    required String prospectId,
  }) {
    return repository.getOrCreateForAppointment(
      appointmentId: appointmentId,
      prospectId: prospectId,
    );
  }
}
