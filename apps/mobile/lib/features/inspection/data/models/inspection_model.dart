import '../../domain/entities/inspection_entity.dart';

class InspectionModel extends InspectionEntity {
  const InspectionModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.appointmentId,
    required super.ruferoId,
    required super.createdAt,
    required super.updatedAt,
    super.roofAgeYears,
    super.roofMaterial,
    super.stormDate,
    super.affectedAreas,
    super.severity,
    super.scopeNotes,
    super.photoCountExpected,
    super.completedAt,
  });

  factory InspectionModel.fromMap(Map<String, dynamic> map) {
    return InspectionModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      prospectId: map['prospect_id'] as String,
      appointmentId: map['appointment_id'] as String,
      ruferoId: map['rufero_id'] as String,
      roofAgeYears: map['roof_age_years'] as int?,
      roofMaterial: map['roof_material'] as String?,
      stormDate: _parseDate(map['storm_date']),
      affectedAreas: _parseStringList(map['affected_areas']),
      severity: map['severity'] as int?,
      scopeNotes: map['scope_notes'] as String?,
      photoCountExpected: (map['photo_count_expected'] as int?) ?? 0,
      completedAt: _parseDateTime(map['completed_at']),
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(
        (map['updated_at'] ?? map['created_at']) as String,
      ),
    );
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) {
      // 'YYYY-MM-DD' from Postgres date column.
      return DateTime.tryParse(value);
    }
    return null;
  }

  static List<String> _parseStringList(dynamic value) {
    if (value is List) {
      return value.whereType<String>().toList(growable: false);
    }
    return const [];
  }
}
