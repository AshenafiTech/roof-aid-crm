import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/appointment_entity.dart';

abstract class AppointmentRepository {
  /// All appointments where the current rufero is `rufero_id`, filtered
  /// by date range if supplied (used by the Calendar's visible window).
  Future<Either<Failure, List<AppointmentEntity>>> getMyAppointments({
    DateTime? from,
    DateTime? to,
  });

  /// Realtime stream of the current rufero's appointments.
  Stream<List<AppointmentEntity>> watchMyAppointments();

  /// Calls the `transition_appointment` RPC (web + mobile share this path).
  /// Reason is required when `to` is 'cancelled' or 'no_show'.
  Future<Either<Failure, Unit>> transition({
    required String appointmentId,
    required String to,
    String? reason,
  });

  /// All appointments for a prospect, newest scheduled first. Used by
  /// the prospect-detail Appointments tab. RLS restricts what each
  /// role sees (rufero → own appointments only; admin / telefonista /
  /// owner → all tenant appointments for the prospect).
  Future<Either<Failure, List<AppointmentEntity>>> getForProspect(
    String prospectId,
  );
}
