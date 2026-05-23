import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../../../../core/offline/hive_boxes.dart';
import '../../domain/entities/appointment_entity.dart';

/// Local cache of the rufero's appointments + any offline-applied
/// status transitions waiting to drain.
///
/// Two Hive entries are colocated in the [appointmentCache] box:
///   - `appt:<id>`        — full appointment row, JSON-encoded
///   - `pending:<id>`     — { status, reason } the worker still needs
///                          to replay against the server
///
/// On reads, the repo overlays any `pending:<id>` rows on top of the
/// cached appointments so the UI shows the optimistic status (e.g.
/// "Completed" immediately after the rufero taps Mark complete, even
/// while the actual transition op sits in the queue).
abstract class AppointmentLocalDatasource {
  Future<void> init();

  /// Replace the cached appointment set wholesale. Called after every
  /// successful remote fetch so the next offline read is up to date.
  Future<void> cacheList(List<AppointmentEntity> appointments);

  /// All cached appointments, with any pending status overrides
  /// already applied. Order is whatever Hive returns; callers sort.
  Future<List<AppointmentEntity>> getCached();

  /// Cached appointments for a single prospect (filtered in memory).
  Future<List<AppointmentEntity>> getCachedForProspect(String prospectId);

  /// Mark a transition as pending — applied locally + waiting for the
  /// sync worker to push.
  Future<void> markPendingTransition({
    required String appointmentId,
    required String toStatus,
    String? reason,
  });

  /// Read the pending transition for [appointmentId], if any. Used by
  /// the drain handler to know what status / reason to send.
  Future<PendingTransition?> getPendingTransition(String appointmentId);

  /// After a successful drain, clear the override so future reads no
  /// longer overlay it (the cached row will pick up the new status on
  /// the next remote fetch anyway).
  Future<void> clearPendingTransition(String appointmentId);
}

class AppointmentLocalDatasourceImpl implements AppointmentLocalDatasource {
  Box<String>? _box;

  @override
  Future<void> init() async {
    _box ??= await Hive.openBox<String>(HiveBoxes.appointmentCache);
  }

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  String _apptKey(String id) => 'appt:$id';
  String _pendingKey(String id) => 'pending:$id';

  @override
  Future<void> cacheList(List<AppointmentEntity> appointments) async {
    final box = await _opened();
    // Drop stale cached rows that aren't in the new fetch — keeps the
    // local mirror in sync with the server's view of the rufero's
    // schedule. Pending transitions are NOT dropped; if the appt was
    // already removed server-side, the drain will surface an error.
    final keepIds = appointments.map((a) => a.id).toSet();
    final toDelete = <dynamic>[];
    for (final key in box.keys) {
      if (key is! String || !key.startsWith('appt:')) continue;
      final id = key.substring('appt:'.length);
      if (!keepIds.contains(id)) toDelete.add(key);
    }
    for (final k in toDelete) {
      await box.delete(k);
    }
    for (final a in appointments) {
      await box.put(_apptKey(a.id), _encode(a));
    }
  }

  @override
  Future<List<AppointmentEntity>> getCached() async {
    final box = await _opened();
    final out = <AppointmentEntity>[];
    for (final key in box.keys) {
      if (key is! String || !key.startsWith('appt:')) continue;
      final raw = box.get(key);
      if (raw == null) continue;
      try {
        final a = _decode(raw);
        final pendingRaw = box.get(_pendingKey(a.id));
        if (pendingRaw == null) {
          out.add(a);
        } else {
          try {
            final p = _decodePending(pendingRaw);
            out.add(_applyOverride(a, p));
          } catch (_) {
            out.add(a);
          }
        }
      } catch (_) {
        // Corrupt row — skip.
      }
    }
    return out;
  }

  @override
  Future<List<AppointmentEntity>> getCachedForProspect(
    String prospectId,
  ) async {
    final all = await getCached();
    return all.where((a) => a.prospectId == prospectId).toList()
      ..sort((a, b) => b.scheduledAt.compareTo(a.scheduledAt));
  }

  @override
  Future<void> markPendingTransition({
    required String appointmentId,
    required String toStatus,
    String? reason,
  }) async {
    final box = await _opened();
    await box.put(
      _pendingKey(appointmentId),
      jsonEncode({
        'to_status': toStatus,
        'reason': reason,
      }),
    );
  }

  @override
  Future<PendingTransition?> getPendingTransition(String appointmentId) async {
    final box = await _opened();
    final raw = box.get(_pendingKey(appointmentId));
    if (raw == null) return null;
    try {
      return _decodePending(raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> clearPendingTransition(String appointmentId) async {
    final box = await _opened();
    await box.delete(_pendingKey(appointmentId));
  }

  // ── helpers ───────────────────────────────────────────────

  AppointmentEntity _applyOverride(
    AppointmentEntity a,
    PendingTransition p,
  ) {
    // Surface the new status + reason locally; we leave updatedAt
    // alone so realtime stays the source of truth there.
    return AppointmentEntity(
      id: a.id,
      tenantId: a.tenantId,
      prospectId: a.prospectId,
      ruferoId: a.ruferoId,
      scheduledAt: a.scheduledAt,
      durationMinutes: a.durationMinutes,
      status: p.toStatus,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      prospectName: a.prospectName,
      notes: a.notes,
      cancellationReason: p.reason ?? a.cancellationReason,
      rescheduledFrom: a.rescheduledFrom,
      prospectAddress: a.prospectAddress,
      prospectCity: a.prospectCity,
      prospectState: a.prospectState,
      prospectPhones: a.prospectPhones,
      ruferoName: a.ruferoName,
    );
  }

  String _encode(AppointmentEntity a) => jsonEncode({
        'id': a.id,
        'tenant_id': a.tenantId,
        'prospect_id': a.prospectId,
        'rufero_id': a.ruferoId,
        'scheduled_at': a.scheduledAt.toIso8601String(),
        'duration_minutes': a.durationMinutes,
        'status': a.status,
        'notes': a.notes,
        'cancellation_reason': a.cancellationReason,
        'rescheduled_from': a.rescheduledFrom,
        'created_at': a.createdAt.toIso8601String(),
        'updated_at': a.updatedAt.toIso8601String(),
        'prospect_name': a.prospectName,
        'prospect_address': a.prospectAddress,
        'prospect_city': a.prospectCity,
        'prospect_state': a.prospectState,
        'prospect_phones': a.prospectPhones,
        'rufero_name': a.ruferoName,
      });

  AppointmentEntity _decode(String raw) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return AppointmentEntity(
      id: m['id'] as String,
      tenantId: m['tenant_id'] as String,
      prospectId: m['prospect_id'] as String,
      ruferoId: m['rufero_id'] as String,
      scheduledAt: DateTime.parse(m['scheduled_at'] as String),
      durationMinutes: (m['duration_minutes'] as num).toInt(),
      status: m['status'] as String,
      createdAt: DateTime.parse(m['created_at'] as String),
      updatedAt: DateTime.parse(m['updated_at'] as String),
      prospectName: m['prospect_name'] as String,
      notes: m['notes'] as String?,
      cancellationReason: m['cancellation_reason'] as String?,
      rescheduledFrom: m['rescheduled_from'] as String?,
      prospectAddress: m['prospect_address'] as String?,
      prospectCity: m['prospect_city'] as String?,
      prospectState: m['prospect_state'] as String?,
      prospectPhones:
          (m['prospect_phones'] as List?)?.cast<String>() ?? const [],
      ruferoName: m['rufero_name'] as String?,
    );
  }

  PendingTransition _decodePending(String raw) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return PendingTransition(
      toStatus: m['to_status'] as String,
      reason: m['reason'] as String?,
    );
  }
}

class PendingTransition {
  final String toStatus;
  final String? reason;
  const PendingTransition({required this.toStatus, this.reason});
}
