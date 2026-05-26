/// A photo attached to an inspection.
///
/// `localFilePath` is set while the photo is sitting on disk waiting to
/// upload (Stage 8 offline queue path). After Storage upload completes,
/// `uploadedAt` is non-null and the binary lives at `storagePath`.
class PhotoEntity {
  final String id;
  final String tenantId;
  final String? inspectionId; // null until the inspection_reports row exists
  final String prospectId;
  final String storagePath;
  final List<String> tags;
  final double? gpsLat;
  final double? gpsLng;
  final DateTime takenAt;
  final DateTime? uploadedAt;
  final int? widthPx;
  final int? heightPx;
  final int? fileSizeBytes;
  final String? createdBy;
  final DateTime createdAt;

  /// Set when the photo is queued locally — points at the JPEG file in
  /// the app's documents directory.
  final String? localFilePath;

  const PhotoEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.storagePath,
    required this.tags,
    required this.takenAt,
    required this.createdAt,
    this.inspectionId,
    this.gpsLat,
    this.gpsLng,
    this.uploadedAt,
    this.widthPx,
    this.heightPx,
    this.fileSizeBytes,
    this.createdBy,
    this.localFilePath,
  });

  bool get isUploaded => uploadedAt != null;
  bool get isPending => uploadedAt == null;

  /// First tag as the "primary" label for the thumbnail overlay.
  String? get primaryTag => tags.isNotEmpty ? tags.first : null;

  PhotoEntity copyWith({
    String? inspectionId,
    List<String>? tags,
    DateTime? uploadedAt,
    String? localFilePath,
  }) {
    return PhotoEntity(
      id: id,
      tenantId: tenantId,
      inspectionId: inspectionId ?? this.inspectionId,
      prospectId: prospectId,
      storagePath: storagePath,
      tags: tags ?? this.tags,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      takenAt: takenAt,
      uploadedAt: uploadedAt ?? this.uploadedAt,
      widthPx: widthPx,
      heightPx: heightPx,
      fileSizeBytes: fileSizeBytes,
      createdBy: createdBy,
      createdAt: createdAt,
      localFilePath: localFilePath ?? this.localFilePath,
    );
  }
}
