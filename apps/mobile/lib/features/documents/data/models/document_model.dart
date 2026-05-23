import '../../domain/entities/document_entity.dart';

class DocumentModel extends DocumentEntity {
  const DocumentModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.type,
    required super.status,
    required super.createdAt,
    required super.updatedAt,
    super.storagePath,
    super.signedStoragePath,
    super.createdBy,
  });

  factory DocumentModel.fromMap(Map<String, dynamic> map) {
    // Defensive: this factory parses BOTH full table rows (from a
    // SELECT against `documents`) AND the lighter payload returned by
    // the `embed-signature` edge function — that response only carries
    // a subset of fields (id, storage_path, status, signer_name,
    // signed_at, …). Fall back to safe defaults for the required
    // fields when they're absent so the parse doesn't throw "type
    // null is not supported" after a successful sign.
    return DocumentModel(
      id: map['id'] as String,
      tenantId: (map['tenant_id'] as String?) ?? '',
      prospectId: (map['prospect_id'] as String?) ?? '',
      type: (map['type'] as String?) ?? '3rd_party_auth',
      status: (map['status'] as String?) ?? 'generated',
      storagePath: map['storage_path'] as String?,
      signedStoragePath: map['signed_storage_path'] as String?,
      createdBy: map['created_by'] as String?,
      createdAt: _parseDate(map['created_at']) ?? DateTime.now(),
      updatedAt: _parseDate(map['updated_at']) ??
          _parseDate(map['signed_at']) ??
          _parseDate(map['created_at']) ??
          DateTime.now(),
    );
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }
}
