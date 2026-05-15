import '../../domain/entities/appointment_entity.dart';

sealed class AppointmentsState {
  const AppointmentsState();
}

class AppointmentsInitial extends AppointmentsState {
  const AppointmentsInitial();
}

class AppointmentsLoading extends AppointmentsState {
  const AppointmentsLoading();
}

class AppointmentsLoaded extends AppointmentsState {
  final List<AppointmentEntity> appointments;
  final String? lastError; // surfaces transient transition failures

  const AppointmentsLoaded(this.appointments, {this.lastError});

  AppointmentsLoaded copyWith({
    List<AppointmentEntity>? appointments,
    String? Function()? lastError,
  }) {
    return AppointmentsLoaded(
      appointments ?? this.appointments,
      lastError: lastError != null ? lastError() : this.lastError,
    );
  }
}

class AppointmentsError extends AppointmentsState {
  final String message;
  final bool isOffline;
  const AppointmentsError(this.message, {this.isOffline = false});
}
