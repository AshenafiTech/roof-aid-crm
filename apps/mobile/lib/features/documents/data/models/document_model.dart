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
    return DocumentModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      prospectId: map['prospect_id'] as String,
      type: (map['type'] as String?) ?? 'authorization',
      status: (map['status'] as String?) ?? 'generated',
      storagePath: map['storage_path'] as String?,
      signedStoragePath: map['signed_storage_path'] as String?,
      createdBy: map['created_by'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(
        (map['updated_at'] ?? map['created_at']) as String,
      ),
    );
  }
}
