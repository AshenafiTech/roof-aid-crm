/// One row in `inspection_reports`.
class InspectionEntity {
  final String id;
  final String tenantId;
  final String prospectId;
  final String appointmentId;
  final String ruferoId;
  final int? roofAgeYears;
  final String? roofMaterial; // 'asphalt_shingle' | 'metal' | 'tile' | 'flat' | 'other'
  final DateTime? stormDate;
  final List<String> affectedAreas;
  final int? severity; // 1..5
  final String? scopeNotes;
  final int photoCountExpected;
  final DateTime? completedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const InspectionEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.appointmentId,
    required this.ruferoId,
    required this.createdAt,
    required this.updatedAt,
    this.roofAgeYears,
    this.roofMaterial,
    this.stormDate,
    this.affectedAreas = const [],
    this.severity,
    this.scopeNotes,
    this.photoCountExpected = 0,
    this.completedAt,
  });

  bool get isCompleted => completedAt != null;

  InspectionEntity copyWith({
    int? roofAgeYears,
    String? roofMaterial,
    DateTime? stormDate,
    List<String>? affectedAreas,
    int? severity,
    String? scopeNotes,
    int? photoCountExpected,
    DateTime? completedAt,
    DateTime? updatedAt,
  }) {
    return InspectionEntity(
      id: id,
      tenantId: tenantId,
      prospectId: prospectId,
      appointmentId: appointmentId,
      ruferoId: ruferoId,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      roofAgeYears: roofAgeYears ?? this.roofAgeYears,
      roofMaterial: roofMaterial ?? this.roofMaterial,
      stormDate: stormDate ?? this.stormDate,
      affectedAreas: affectedAreas ?? this.affectedAreas,
      severity: severity ?? this.severity,
      scopeNotes: scopeNotes ?? this.scopeNotes,
      photoCountExpected: photoCountExpected ?? this.photoCountExpected,
      completedAt: completedAt ?? this.completedAt,
    );
  }
}

/// Damage form payload. Used as the input to `saveInspectionReport`.
class DamageFormData {
  final int? roofAgeYears;
  final String? roofMaterial;
  final DateTime? stormDate;
  final List<String> affectedAreas;
  final int? severity;
  final String? notes;

  const DamageFormData({
    this.roofAgeYears,
    this.roofMaterial,
    this.stormDate,
    this.affectedAreas = const [],
    this.severity,
    this.notes,
  });

  /// True when every required field is set. Photo-count requirement is
  /// enforced by the BLoC separately (needs the photo list).
  bool get isValid =>
      roofMaterial != null &&
      affectedAreas.isNotEmpty &&
      severity != null;

  DamageFormData copyWith({
    int? Function()? roofAgeYears,
    String? Function()? roofMaterial,
    DateTime? Function()? stormDate,
    List<String>? affectedAreas,
    int? Function()? severity,
    String? Function()? notes,
  }) {
    return DamageFormData(
      roofAgeYears: roofAgeYears != null ? roofAgeYears() : this.roofAgeYears,
      roofMaterial: roofMaterial != null ? roofMaterial() : this.roofMaterial,
      stormDate: stormDate != null ? stormDate() : this.stormDate,
      affectedAreas: affectedAreas ?? this.affectedAreas,
      severity: severity != null ? severity() : this.severity,
      notes: notes != null ? notes() : this.notes,
    );
  }

  factory DamageFormData.fromInspection(InspectionEntity i) {
    return DamageFormData(
      roofAgeYears: i.roofAgeYears,
      roofMaterial: i.roofMaterial,
      stormDate: i.stormDate,
      affectedAreas: i.affectedAreas,
      severity: i.severity,
      notes: i.scopeNotes,
    );
  }
}
