import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';

abstract class DocumentRepository {
  Future<Either<Failure, List<DocumentEntity>>> getForProspect(
    String prospectId,
  );

  /// Calls the `generate-pdf` Edge Function. Returns the new doc row.
  Future<Either<Failure, DocumentEntity>> generatePdf({
    required String prospectId,
    required String templateKind, // 'authorization' | 'acv_contract' | 'rcv_contract'
    Map<String, dynamic>? fields,
  });

  /// Calls the `embed-signature` Edge Function. Returns the updated doc.
  /// `deviceType` is 'mobile_android' or 'mobile_ios' here.
  Future<Either<Failure, DocumentEntity>> embedSignature({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  });

  /// 1-hour signed URL for either the unsigned or signed PDF.
  Future<Either<Failure, String>> getSignedUrl(String storagePath);
}
