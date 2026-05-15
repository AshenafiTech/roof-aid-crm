import '../entities/appointment_entity.dart';
import '../repositories/appointment_repository.dart';

class WatchMyAppointments {
  final AppointmentRepository repository;

  const WatchMyAppointments(this.repository);

  Stream<List<AppointmentEntity>> call() {
    return repository.watchMyAppointments();
  }
}
