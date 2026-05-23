import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../../../../core/offline/hive_boxes.dart';
import '../../domain/entities/inspection_entity.dart';

/// Hive-backed local cache for inspection drafts. Keyed by the
/// server's `inspection_id` once we have it. The whole row is stored
/// as JSON so the on-disk schema can evolve without ceremony.
///
/// Two fields beyond [InspectionEntity]:
/// - `dirty: bool` — local has changes not yet pushed to the server.
///   Set by the repo when a write fails (offline), cleared by the
///   sync worker after a successful drain.
/// - `appointment_id` (already on the entity) — used by
///   [findByAppointmentId] so the repo can fall back to local cache
///   when `getOrCreateForAppointment` is called offline on a previously
///   loaded inspection.
abstract class InspectionLocalDatasource {
  Future<void> init();

  Future<InspectionEntity?> getById(String inspectionId);
  Future<InspectionEntity?> findByAppointmentId(String appointmentId);

  /// Upsert. Caller sets [dirty] true when the change hasn't been
  /// confirmed by the server yet, false after a successful server write
  /// or after the sync worker drains the pending op.
  Future<void> save(InspectionEntity inspection, {required bool dirty});

  /// Whether the local copy has unsynced changes. Read by the sync
  /// handler before it pushes — guards against draining stale ops
  /// against an already-up-to-date server.
  Future<bool> isDirty(String inspectionId);

  Future<void> markClean(String inspectionId);
}

class InspectionLocalDatasourceImpl implements InspectionLocalDatasource {
  Box<String>? _box;

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  @override
  Future<void> init() async {
    _box ??= await Hive.openBox<String>(HiveBoxes.inspectionDrafts);
  }

  @override
  Future<InspectionEntity?> getById(String inspectionId) async {
    final box = await _opened();
    final raw = box.get(inspectionId);
    if (raw == null) return null;
    return _decode(raw).inspection;
  }

  @override
  Future<InspectionEntity?> findByAppointmentId(String appointmentId) async {
    final box = await _opened();
    for (final raw in box.values) {
      try {
        final wrapped = _decode(raw);
        if (wrapped.inspection.appointmentId == appointmentId) {
          return wrapped.inspection;
        }
      } catch (_) {
        // Corrupt row — skip.
      }
    }
    return null;
  }

  @override
  Future<void> save(InspectionEntity inspection, {required bool dirty}) async {
    final box = await _opened();
    final wrapped = _WrappedDraft(inspection: inspection, dirty: dirty);
    await box.put(inspection.id, _encode(wrapped));
  }

  @override
  Future<bool> isDirty(String inspectionId) async {
    final box = await _opened();
    final raw = box.get(inspectionId);
    if (raw == null) return false;
    return _decode(raw).dirty;
  }

  @override
  Future<void> markClean(String inspectionId) async {
    final box = await _opened();
    final raw = box.get(inspectionId);
    if (raw == null) return;
    final current = _decode(raw);
    if (!current.dirty) return;
    await box.put(
      inspectionId,
      _encode(_WrappedDraft(inspection: current.inspection, dirty: false)),
    );
  }

  // ── (de)serialization ─────────────────────────────────────

  String _encode(_WrappedDraft w) {
    final i = w.inspection;
    return jsonEncode({
      'dirty': w.dirty,
      'inspection': {
        'id': i.id,
        'tenant_id': i.tenantId,
        'prospect_id': i.prospectId,
        'appointment_id': i.appointmentId,
        'rufero_id': i.ruferoId,
        'roof_age_years': i.roofAgeYears,
        'roof_material': i.roofMaterial,
        'storm_date': i.stormDate?.toIso8601String(),
        'affected_areas': i.affectedAreas,
        'severity': i.severity,
        'scope_notes': i.scopeNotes,
        'photo_count_expected': i.photoCountExpected,
        'completed_at': i.completedAt?.toIso8601String(),
        'created_at': i.createdAt.toIso8601String(),
        'updated_at': i.updatedAt.toIso8601String(),
      },
    });
  }

  _WrappedDraft _decode(String raw) {
    final map = jsonDecode(raw) as Map<String, dynamic>;
    final m = (map['inspection'] as Map).cast<String, dynamic>();
    final inspection = InspectionEntity(
      id: m['id'] as String,
      tenantId: m['tenant_id'] as String,
      prospectId: m['prospect_id'] as String,
      appointmentId: m['appointment_id'] as String,
      ruferoId: m['rufero_id'] as String,
      roofAgeYears: (m['roof_age_years'] as num?)?.toInt(),
      roofMaterial: m['roof_material'] as String?,
      stormDate: m['storm_date'] != null
          ? DateTime.parse(m['storm_date'] as String)
          : null,
      affectedAreas: (m['affected_areas'] as List?)?.cast<String>() ?? const [],
      severity: (m['severity'] as num?)?.toInt(),
      scopeNotes: m['scope_notes'] as String?,
      photoCountExpected: (m['photo_count_expected'] as num?)?.toInt() ?? 0,
      completedAt: m['completed_at'] != null
          ? DateTime.parse(m['completed_at'] as String)
          : null,
      createdAt: DateTime.parse(m['created_at'] as String),
      updatedAt: DateTime.parse(m['updated_at'] as String),
    );
    return _WrappedDraft(
      inspection: inspection,
      dirty: map['dirty'] as bool? ?? false,
    );
  }
}

class _WrappedDraft {
  final InspectionEntity inspection;
  final bool dirty;
  const _WrappedDraft({required this.inspection, required this.dirty});
}
