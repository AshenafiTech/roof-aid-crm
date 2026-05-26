import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/appointment_entity.dart';
import '../repositories/appointment_repository.dart';

class GetProspectAppointments {
  final AppointmentRepository repository;

  const GetProspectAppointments(this.repository);

  Future<Either<Failure, List<AppointmentEntity>>> call(String prospectId) {
    return repository.getForProspect(prospectId);
  }
}
