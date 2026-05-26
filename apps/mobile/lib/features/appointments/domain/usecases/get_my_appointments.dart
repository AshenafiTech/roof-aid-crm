import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/appointment_entity.dart';
import '../repositories/appointment_repository.dart';

class GetMyAppointments {
  final AppointmentRepository repository;

  const GetMyAppointments(this.repository);

  Future<Either<Failure, List<AppointmentEntity>>> call({
    DateTime? from,
    DateTime? to,
  }) {
    return repository.getMyAppointments(from: from, to: to);
  }
}
