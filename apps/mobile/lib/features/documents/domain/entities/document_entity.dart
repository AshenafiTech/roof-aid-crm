/// A row in `documents`.
class DocumentEntity {
  final String id;
  final String tenantId;
  final String prospectId;
  final String type; // 'authorization' | 'acv_contract' | 'rcv_contract' | 'upload'
  final String status; // 'generated' | 'sent' | 'signed' | 'failed' | 'uploaded'
  final String? storagePath; // unsigned PDF
  final String? signedStoragePath; // populated after embed-signature
  final String? createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  const DocumentEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.type,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.storagePath,
    this.signedStoragePath,
    this.createdBy,
  });

  bool get isSigned => status == 'signed';
}
