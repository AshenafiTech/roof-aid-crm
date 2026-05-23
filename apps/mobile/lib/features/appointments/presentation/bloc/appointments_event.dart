import '../../domain/entities/appointment_entity.dart';

sealed class AppointmentsEvent {
  const AppointmentsEvent();
}

class AppointmentsLoadRequested extends AppointmentsEvent {
  const AppointmentsLoadRequested();
}

class AppointmentsRefreshRequested extends AppointmentsEvent {
  const AppointmentsRefreshRequested();
}

class AppointmentsStreamUpdated extends AppointmentsEvent {
  final List<AppointmentEntity> appointments;
  const AppointmentsStreamUpdated(this.appointments);
}

class AppointmentsStreamFailed extends AppointmentsEvent {
  final String message;
  const AppointmentsStreamFailed(this.message);
}

class AppointmentTransitionRequested extends AppointmentsEvent {
  final String appointmentId;
  final String to;
  final String? reason;
  const AppointmentTransitionRequested({
    required this.appointmentId,
    required this.to,
    this.reason,
  });
}
