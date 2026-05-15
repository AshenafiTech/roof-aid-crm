import '../../domain/entities/photo_entity.dart';

class PhotoModel extends PhotoEntity {
  const PhotoModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.storagePath,
    required super.tags,
    required super.takenAt,
    required super.createdAt,
    super.inspectionId,
    super.gpsLat,
    super.gpsLng,
    super.uploadedAt,
    super.widthPx,
    super.heightPx,
    super.fileSizeBytes,
    super.createdBy,
    super.localFilePath,
  });

  factory PhotoModel.fromMap(Map<String, dynamic> map) {
    return PhotoModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      inspectionId: map['inspection_id'] as String?,
      prospectId: map['prospect_id'] as String,
      storagePath: map['storage_path'] as String,
      tags: _parseStringList(map['tags']),
      gpsLat: _parseDouble(map['gps_lat']),
      gpsLng: _parseDouble(map['gps_lng']),
      takenAt: DateTime.parse(map['taken_at'] as String),
      uploadedAt: _parseDateTime(map['uploaded_at']),
      widthPx: map['width_px'] as int?,
      heightPx: map['height_px'] as int?,
      fileSizeBytes: map['file_size_bytes'] as int?,
      createdBy: map['created_by'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
    );
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static List<String> _parseStringList(dynamic value) {
    if (value is List) {
      return value.whereType<String>().toList(growable: false);
    }
    return const [];
  }
}
