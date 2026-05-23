import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';

import '../../../../core/offline/hive_boxes.dart';
import '../../domain/entities/photo_entity.dart';

/// On-disk + Hive store for inspection photos. Two concerns colocated
/// because they always travel together: the JPEG bytes go to the app
/// documents directory, the metadata goes to Hive, and we never want
/// one without the other.
///
/// Lifecycle of a photo:
///   1. [savePending] — write bytes to disk + Hive row with `uploaded:
///      false`. Returns a synthetic [PhotoEntity] so the UI can render
///      it immediately.
///   2. [markUploaded] — sync handler has uploaded the file and the
///      server has the row; flip `uploaded: true` and store the real
///      server storage path.
///   3. [delete] — remove the disk file + Hive row.
abstract class PhotoLocalDatasource {
  Future<void> init();

  /// Generate a UUID-keyed entry, persist bytes to disk, store metadata
  /// in Hive with `uploaded: false`. Caller supplies the [photoId] (so
  /// the same id is used by the queued upload op and the server row).
  Future<PhotoEntity> savePending({
    required String photoId,
    required String tenantId,
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
    String? createdBy,
  });

  /// Read raw bytes from disk for re-upload. Null if the file was lost
  /// (manual cleanup, OS evicted the documents dir, …). Treat as a
  /// drainable terminal state — the photo can't be recovered.
  Future<Uint8List?> readBytes(String photoId);

  /// After a successful upload, swap the local "pending" marker for the
  /// real server storage path. Bytes stay on disk until the row is
  /// either deleted explicitly or pruned later as a housekeeping step
  /// (next slice).
  Future<void> markUploaded({
    required String photoId,
    required String serverStoragePath,
    required DateTime uploadedAt,
  });

  /// Replace the tag list on a local record (used both before upload —
  /// the next upload picks up the new tags — and after upload while
  /// waiting for the [photo_tag_update] op to drain).
  Future<void> updateTags(String photoId, List<String> tags);

  /// Remove the on-disk file + Hive metadata. Safe to call on missing
  /// photos.
  Future<void> delete(String photoId);

  /// All un-uploaded photos for an inspection — these are what we merge
  /// into the server fetch so the UI sees the full set.
  Future<List<PhotoEntity>> pendingFor(String inspectionId);

  /// Look up a single id (whether pending or already-uploaded — we keep
  /// uploaded records around so the UI can show file:// previews even
  /// after a successful drain).
  Future<PhotoEntity?> getEntity(String photoId);
}

class PhotoLocalDatasourceImpl implements PhotoLocalDatasource {
  Box<String>? _box;
  Directory? _photosDir;

  @override
  Future<void> init() async {
    _box ??= await Hive.openBox<String>(HiveBoxes.photoBlobs);
    if (_photosDir == null) {
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory('${docs.path}/inspection_photos');
      if (!await dir.exists()) await dir.create(recursive: true);
      _photosDir = dir;
    }
  }

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  Future<Directory> _diskDir() async {
    await init();
    return _photosDir!;
  }

  File _fileFor(Directory dir, String inspectionId, String photoId) {
    return File('${dir.path}/$inspectionId/$photoId.jpg');
  }

  @override
  Future<PhotoEntity> savePending({
    required String photoId,
    required String tenantId,
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
    String? createdBy,
  }) async {
    final dir = await _diskDir();
    final perInspectionDir = Directory('${dir.path}/$inspectionId');
    if (!await perInspectionDir.exists()) {
      await perInspectionDir.create(recursive: true);
    }
    final file = _fileFor(dir, inspectionId, photoId);
    await file.writeAsBytes(bytes, flush: true);

    final now = DateTime.now();
    final record = _LocalPhotoRecord(
      id: photoId,
      tenantId: tenantId,
      inspectionId: inspectionId,
      prospectId: prospectId,
      tags: List.unmodifiable(tags),
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      widthPx: widthPx,
      heightPx: heightPx,
      fileSizeBytes: bytes.lengthInBytes,
      createdBy: createdBy,
      localFilePath: file.path,
      serverStoragePath: null,
      takenAt: now,
      createdAt: now,
      uploadedAt: null,
    );
    await (await _opened()).put(photoId, _encode(record));

    return record.toEntity();
  }

  Future<_LocalPhotoRecord?> _getRecord(String photoId) async {
    final box = await _opened();
    final raw = box.get(photoId);
    if (raw == null) return null;
    try {
      return _decode(raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<Uint8List?> readBytes(String photoId) async {
    final record = await _getRecord(photoId);
    if (record == null) return null;
    final file = File(record.localFilePath);
    if (!await file.exists()) return null;
    return await file.readAsBytes();
  }

  @override
  Future<void> markUploaded({
    required String photoId,
    required String serverStoragePath,
    required DateTime uploadedAt,
  }) async {
    final record = await _getRecord(photoId);
    if (record == null) return;
    final next = record.copyWith(
      serverStoragePath: () => serverStoragePath,
      uploadedAt: () => uploadedAt,
    );
    await (await _opened()).put(photoId, _encode(next));
  }

  @override
  Future<void> updateTags(String photoId, List<String> tags) async {
    final record = await _getRecord(photoId);
    if (record == null) return;
    final next = record.copyWith(tags: List.unmodifiable(tags));
    await (await _opened()).put(photoId, _encode(next));
  }

  @override
  Future<void> delete(String photoId) async {
    final record = await _getRecord(photoId);
    if (record != null) {
      try {
        final file = File(record.localFilePath);
        if (await file.exists()) await file.delete();
      } catch (_) {
        // Best-effort — orphan files are recoverable; Hive row delete
        // is the primary state change.
      }
    }
    await (await _opened()).delete(photoId);
  }

  @override
  Future<List<PhotoEntity>> pendingFor(String inspectionId) async {
    final box = await _opened();
    final out = <PhotoEntity>[];
    for (final raw in box.values) {
      try {
        final r = _decode(raw);
        if (r.inspectionId != inspectionId) continue;
        if (r.uploadedAt != null) continue; // server fetch will cover it
        out.add(r.toEntity());
      } catch (_) {
        // Corrupt row — ignore.
      }
    }
    out.sort((a, b) => a.takenAt.compareTo(b.takenAt));
    return out;
  }

  @override
  Future<PhotoEntity?> getEntity(String photoId) async {
    final record = await _getRecord(photoId);
    return record?.toEntity();
  }

  // ── (de)serialization ─────────────────────────────────────

  String _encode(_LocalPhotoRecord r) {
    return jsonEncode({
      'id': r.id,
      'tenant_id': r.tenantId,
      'inspection_id': r.inspectionId,
      'prospect_id': r.prospectId,
      'tags': r.tags,
      'gps_lat': r.gpsLat,
      'gps_lng': r.gpsLng,
      'width_px': r.widthPx,
      'height_px': r.heightPx,
      'file_size_bytes': r.fileSizeBytes,
      'created_by': r.createdBy,
      'local_file_path': r.localFilePath,
      'server_storage_path': r.serverStoragePath,
      'taken_at': r.takenAt.toIso8601String(),
      'created_at': r.createdAt.toIso8601String(),
      'uploaded_at': r.uploadedAt?.toIso8601String(),
    });
  }

  _LocalPhotoRecord _decode(String raw) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return _LocalPhotoRecord(
      id: m['id'] as String,
      tenantId: m['tenant_id'] as String,
      inspectionId: m['inspection_id'] as String,
      prospectId: m['prospect_id'] as String,
      tags: List<String>.unmodifiable(
        (m['tags'] as List?)?.cast<String>() ?? const [],
      ),
      gpsLat: (m['gps_lat'] as num?)?.toDouble(),
      gpsLng: (m['gps_lng'] as num?)?.toDouble(),
      widthPx: (m['width_px'] as num?)?.toInt(),
      heightPx: (m['height_px'] as num?)?.toInt(),
      fileSizeBytes: (m['file_size_bytes'] as num?)?.toInt(),
      createdBy: m['created_by'] as String?,
      localFilePath: m['local_file_path'] as String,
      serverStoragePath: m['server_storage_path'] as String?,
      takenAt: DateTime.parse(m['taken_at'] as String),
      createdAt: DateTime.parse(m['created_at'] as String),
      uploadedAt: m['uploaded_at'] != null
          ? DateTime.parse(m['uploaded_at'] as String)
          : null,
    );
  }
}

/// Internal record. Mirrors [PhotoEntity] + a few sync-only fields
/// (`local_file_path`, `server_storage_path`).
class _LocalPhotoRecord {
  final String id;
  final String tenantId;
  final String inspectionId;
  final String prospectId;
  final List<String> tags;
  final double? gpsLat;
  final double? gpsLng;
  final int? widthPx;
  final int? heightPx;
  final int? fileSizeBytes;
  final String? createdBy;
  final String localFilePath;
  final String? serverStoragePath;
  final DateTime takenAt;
  final DateTime createdAt;
  final DateTime? uploadedAt;

  const _LocalPhotoRecord({
    required this.id,
    required this.tenantId,
    required this.inspectionId,
    required this.prospectId,
    required this.tags,
    required this.localFilePath,
    required this.takenAt,
    required this.createdAt,
    this.gpsLat,
    this.gpsLng,
    this.widthPx,
    this.heightPx,
    this.fileSizeBytes,
    this.createdBy,
    this.serverStoragePath,
    this.uploadedAt,
  });

  _LocalPhotoRecord copyWith({
    List<String>? tags,
    String? Function()? serverStoragePath,
    DateTime? Function()? uploadedAt,
  }) {
    return _LocalPhotoRecord(
      id: id,
      tenantId: tenantId,
      inspectionId: inspectionId,
      prospectId: prospectId,
      tags: tags ?? this.tags,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      widthPx: widthPx,
      heightPx: heightPx,
      fileSizeBytes: fileSizeBytes,
      createdBy: createdBy,
      localFilePath: localFilePath,
      serverStoragePath: serverStoragePath != null
          ? serverStoragePath()
          : this.serverStoragePath,
      takenAt: takenAt,
      createdAt: createdAt,
      uploadedAt: uploadedAt != null ? uploadedAt() : this.uploadedAt,
    );
  }

  /// Surface as the domain [PhotoEntity] used everywhere by the UI.
  ///
  /// For un-uploaded photos `storagePath` is set to a `file://` URI so
  /// the existing thumbnail/viewer code can render straight from disk.
  /// `localFilePath` is also exposed for callers that prefer the
  /// explicit field.
  PhotoEntity toEntity() {
    final isUploaded = uploadedAt != null && serverStoragePath != null;
    return PhotoEntity(
      id: id,
      tenantId: tenantId,
      inspectionId: inspectionId,
      prospectId: prospectId,
      storagePath: isUploaded ? serverStoragePath! : 'file://$localFilePath',
      tags: tags,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      takenAt: takenAt,
      uploadedAt: uploadedAt,
      widthPx: widthPx,
      heightPx: heightPx,
      fileSizeBytes: fileSizeBytes,
      createdBy: createdBy,
      createdAt: createdAt,
      localFilePath: localFilePath,
    );
  }
}
