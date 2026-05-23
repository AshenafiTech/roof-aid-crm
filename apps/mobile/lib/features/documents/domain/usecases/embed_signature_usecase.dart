import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';
import '../repositories/document_repository.dart';

class EmbedSignature {
  final DocumentRepository repository;

  const EmbedSignature(this.repository);

  Future<Either<Failure, DocumentEntity>> call({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  }) {
    return repository.embedSignature(
      documentId: documentId,
      signaturePngBase64: signaturePngBase64,
      signerName: signerName,
      deviceType: deviceType,
    );
  }
}
