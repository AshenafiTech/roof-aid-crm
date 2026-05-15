import '../../domain/entities/appointment_entity.dart';

class AppointmentModel extends AppointmentEntity {
  const AppointmentModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.ruferoId,
    required super.scheduledAt,
    required super.durationMinutes,
    required super.status,
    required super.createdAt,
    required super.updatedAt,
    required super.prospectName,
    super.notes,
    super.cancellationReason,
    super.rescheduledFrom,
    super.prospectAddress,
    super.prospectCity,
    super.prospectState,
    super.prospectPhones,
  });

  factory AppointmentModel.fromMap(Map<String, dynamic> map) {
    final prospect = map['prospect'] as Map<String, dynamic>?;
    return AppointmentModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      prospectId: map['prospect_id'] as String,
      ruferoId: map['rufero_id'] as String,
      scheduledAt: DateTime.parse(map['scheduled_at'] as String),
      durationMinutes: (map['duration_minutes'] as int?) ?? 60,
      status: (map['status'] as String?) ?? 'pending',
      notes: map['notes'] as String?,
      cancellationReason: map['cancellation_reason'] as String?,
      rescheduledFrom: map['rescheduled_from'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(
        (map['updated_at'] ?? map['created_at']) as String,
      ),
      prospectName: (prospect?['name'] as String?) ?? 'Unknown prospect',
      prospectAddress: prospect?['address'] as String?,
      prospectCity: prospect?['city'] as String?,
      prospectState: prospect?['state'] as String?,
      prospectPhones: _parsePhones(prospect?['phones']),
    );
  }

  static List<String> _parsePhones(dynamic value) {
    if (value is List) {
      return value.whereType<String>().toList(growable: false);
    }
    return const [];
  }
}
