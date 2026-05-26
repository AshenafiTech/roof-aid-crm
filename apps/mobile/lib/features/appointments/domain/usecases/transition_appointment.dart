import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/appointment_repository.dart';

class TransitionAppointment {
  final AppointmentRepository repository;

  const TransitionAppointment(this.repository);

  Future<Either<Failure, Unit>> call({
    required String appointmentId,
    required String to,
    String? reason,
  }) {
    return repository.transition(
      appointmentId: appointmentId,
      to: to,
      reason: reason,
    );
  }
}
