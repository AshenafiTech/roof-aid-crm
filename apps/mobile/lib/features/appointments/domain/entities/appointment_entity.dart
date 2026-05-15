/// A flattened appointment row joined with prospect summary fields the
/// mobile UI needs (name, address, primary phone). Mirrors the web side
/// of Stage 2 + the mobile List tab in Stage 9.
class AppointmentEntity {
  final String id;
  final String tenantId;
  final String prospectId;
  final String ruferoId;
  final DateTime scheduledAt;
  final int durationMinutes;
  final String status; // AppointmentStatus.*
  final String? notes;
  final String? cancellationReason;
  final String? rescheduledFrom;
  final DateTime createdAt;
  final DateTime updatedAt;

  // Joined prospect data (read-only on this surface).
  final String prospectName;
  final String? prospectAddress;
  final String? prospectCity;
  final String? prospectState;
  final List<String> prospectPhones;

  const AppointmentEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.ruferoId,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.prospectName,
    this.notes,
    this.cancellationReason,
    this.rescheduledFrom,
    this.prospectAddress,
    this.prospectCity,
    this.prospectState,
    this.prospectPhones = const [],
  });

  DateTime get endsAt =>
      scheduledAt.add(Duration(minutes: durationMinutes));

  String? get primaryPhone =>
      prospectPhones.isNotEmpty ? prospectPhones.first : null;

  String get displayAddress {
    final parts = [prospectAddress, prospectCity, prospectState]
        .where((p) => p != null && p.trim().isNotEmpty)
        .toList();
    return parts.join(', ');
  }

  /// True if a rufero can hit "Start Inspection" right now.
  /// Currently: confirmed status + within ±2h of scheduled time.
  bool get canStartInspection {
    if (status != 'confirmed') return false;
    final now = DateTime.now();
    final from = scheduledAt.subtract(const Duration(hours: 2));
    final to = scheduledAt.add(const Duration(hours: 6));
    return now.isAfter(from) && now.isBefore(to);
  }
}
