import '../../domain/entities/availability_block_entity.dart';

class AvailabilityBlockModel extends AvailabilityBlockEntity {
  const AvailabilityBlockModel({
    required super.id,
    required super.tenantId,
    required super.ruferoId,
    required super.startsAt,
    required super.endsAt,
    required super.kind,
    required super.createdAt,
    super.allDay,
    super.reason,
    super.notes,
    super.recurrenceRule,
    super.recurrenceParentId,
    super.createdBy,
  });

  factory AvailabilityBlockModel.fromMap(Map<String, dynamic> map) {
    return AvailabilityBlockModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      ruferoId: map['rufero_id'] as String,
      startsAt: DateTime.parse(map['starts_at'] as String),
      endsAt: DateTime.parse(map['ends_at'] as String),
      allDay: (map['all_day'] as bool?) ?? false,
      kind: map['kind'] as String,
      reason: map['reason'] as String?,
      notes: map['notes'] as String?,
      recurrenceRule: map['recurrence_rule'] as String?,
      recurrenceParentId: map['recurrence_parent_id'] as String?,
      createdBy: map['created_by'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
    );
  }
}
