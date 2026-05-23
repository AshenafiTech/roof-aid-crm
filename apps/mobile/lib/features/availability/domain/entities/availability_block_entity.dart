/// A single row in `rufero_availability_blocks`.
///
/// Recurring blocks are stored as ONE master row with a `recurrenceRule`
/// (iCal RRULE). The client expands occurrences at render time.
class AvailabilityBlockEntity {
  final String id;
  final String tenantId;
  final String ruferoId;
  final DateTime startsAt;
  final DateTime endsAt;
  final bool allDay;
  final String kind; // AvailabilityKind.busy | availableExtra
  final String? reason; // BlockReason.* or null
  final String? notes;
  final String? recurrenceRule; // iCal RRULE
  final String? recurrenceParentId;
  final String? createdBy;
  final DateTime createdAt;

  const AvailabilityBlockEntity({
    required this.id,
    required this.tenantId,
    required this.ruferoId,
    required this.startsAt,
    required this.endsAt,
    required this.kind,
    required this.createdAt,
    this.allDay = false,
    this.reason,
    this.notes,
    this.recurrenceRule,
    this.recurrenceParentId,
    this.createdBy,
  });

  Duration get duration => endsAt.difference(startsAt);

  bool overlaps(DateTime rangeStart, DateTime rangeEnd) {
    return startsAt.isBefore(rangeEnd) && endsAt.isAfter(rangeStart);
  }

  AvailabilityBlockEntity copyWith({
    DateTime? startsAt,
    DateTime? endsAt,
    bool? allDay,
    String? kind,
    String? reason,
    String? notes,
    String? recurrenceRule,
  }) {
    return AvailabilityBlockEntity(
      id: id,
      tenantId: tenantId,
      ruferoId: ruferoId,
      startsAt: startsAt ?? this.startsAt,
      endsAt: endsAt ?? this.endsAt,
      allDay: allDay ?? this.allDay,
      kind: kind ?? this.kind,
      reason: reason ?? this.reason,
      notes: notes ?? this.notes,
      recurrenceRule: recurrenceRule ?? this.recurrenceRule,
      recurrenceParentId: recurrenceParentId,
      createdBy: createdBy,
      createdAt: createdAt,
    );
  }
}

/// Input payload for creating a new block (server fills id/tenant/created_*).
class CreateAvailabilityBlockInput {
  final DateTime startsAt;
  final DateTime endsAt;
  final bool allDay;
  final String kind;
  final String? reason;
  final String? notes;
  final String? recurrenceRule;

  const CreateAvailabilityBlockInput({
    required this.startsAt,
    required this.endsAt,
    required this.kind,
    this.allDay = false,
    this.reason,
    this.notes,
    this.recurrenceRule,
  });
}

/// Patch payload for updating an existing block.
class UpdateAvailabilityBlockInput {
  final DateTime? startsAt;
  final DateTime? endsAt;
  final bool? allDay;
  final String? kind;
  final String? reason;
  final String? notes;
  final String? recurrenceRule;
  final bool clearRecurrence; // true => set recurrence_rule to null

  const UpdateAvailabilityBlockInput({
    this.startsAt,
    this.endsAt,
    this.allDay,
    this.kind,
    this.reason,
    this.notes,
    this.recurrenceRule,
    this.clearRecurrence = false,
  });
}
