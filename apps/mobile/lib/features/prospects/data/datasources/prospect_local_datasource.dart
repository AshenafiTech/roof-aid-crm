import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../../../../core/offline/hive_boxes.dart';
import '../../domain/entities/prospect_entity.dart';

/// Read-side cache for the rufero's assigned prospects.
///
/// Lets a day-in-the-field rufero pull up the prospects list (and any
/// individual prospect's detail page) without signal. Writes flow only
/// from the online refresh path — we don't mutate prospects from
/// mobile, so there's nothing to queue.
///
/// Hive keys are namespaced `prospect:<id>` so the box can coexist
/// with the document cache (which uses `doc:<id>`).
abstract class ProspectLocalDatasource {
  Future<void> init();

  /// Replace the cached set with [prospects]. Drops stale rows so
  /// re-assigned / archived prospects vanish on the next online sync.
  Future<void> cacheList(List<ProspectEntity> prospects);

  /// All cached prospects.
  Future<List<ProspectEntity>> getCached();

  /// Single cached prospect, or null. Used by the detail page when
  /// the network fetch fails offline.
  Future<ProspectEntity?> getCachedById(String prospectId);
}

class ProspectLocalDatasourceImpl implements ProspectLocalDatasource {
  Box<String>? _box;

  @override
  Future<void> init() async {
    _box ??= await Hive.openBox<String>(HiveBoxes.prospectCache);
  }

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  String _key(String id) => 'prospect:$id';

  @override
  Future<void> cacheList(List<ProspectEntity> prospects) async {
    final box = await _opened();
    final keepIds = prospects.map((p) => p.id).toSet();
    final toDelete = <dynamic>[];
    for (final key in box.keys) {
      if (key is! String || !key.startsWith('prospect:')) continue;
      final id = key.substring('prospect:'.length);
      if (!keepIds.contains(id)) toDelete.add(key);
    }
    for (final k in toDelete) {
      await box.delete(k);
    }
    for (final p in prospects) {
      await box.put(_key(p.id), _encode(p));
    }
  }

  @override
  Future<List<ProspectEntity>> getCached() async {
    final box = await _opened();
    final out = <ProspectEntity>[];
    for (final key in box.keys) {
      if (key is! String || !key.startsWith('prospect:')) continue;
      final raw = box.get(key);
      if (raw == null) continue;
      try {
        out.add(_decode(raw));
      } catch (_) {
        // Corrupt row — skip.
      }
    }
    return out;
  }

  @override
  Future<ProspectEntity?> getCachedById(String prospectId) async {
    final box = await _opened();
    final raw = box.get(_key(prospectId));
    if (raw == null) return null;
    try {
      return _decode(raw);
    } catch (_) {
      return null;
    }
  }

  // ── (de)serialization ─────────────────────────────────────

  String _encode(ProspectEntity p) => jsonEncode({
        'id': p.id,
        'tenant_id': p.tenantId,
        'name': p.name,
        'address': p.address,
        'city': p.city,
        'state': p.state,
        'zip': p.zip,
        'phones': p.phones,
        'email': p.email,
        'status': p.status,
        'assigned_to': p.assignedTo,
        'hail_size': p.hailSize,
        'home_value': p.homeValue,
        'do_not_call': p.doNotCall,
        'do_not_call_reason': p.doNotCallReason,
        'latitude': p.latitude,
        'longitude': p.longitude,
        'created_at': p.createdAt.toIso8601String(),
        'updated_at': p.updatedAt.toIso8601String(),
      });

  ProspectEntity _decode(String raw) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return ProspectEntity(
      id: m['id'] as String,
      tenantId: m['tenant_id'] as String,
      name: m['name'] as String,
      status: m['status'] as String,
      createdAt: DateTime.parse(m['created_at'] as String),
      updatedAt: DateTime.parse(m['updated_at'] as String),
      address: m['address'] as String?,
      city: m['city'] as String?,
      state: m['state'] as String?,
      zip: m['zip'] as String?,
      phones: (m['phones'] as List?)?.cast<String>() ?? const [],
      email: m['email'] as String?,
      assignedTo: m['assigned_to'] as String?,
      hailSize: (m['hail_size'] as num?)?.toDouble(),
      homeValue: (m['home_value'] as num?)?.toDouble(),
      doNotCall: m['do_not_call'] as bool? ?? false,
      doNotCallReason: m['do_not_call_reason'] as String?,
      latitude: (m['latitude'] as num?)?.toDouble(),
      longitude: (m['longitude'] as num?)?.toDouble(),
    );
  }
}
