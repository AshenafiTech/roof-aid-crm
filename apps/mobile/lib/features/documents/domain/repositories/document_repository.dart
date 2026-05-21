import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';

abstract class DocumentRepository {
  Future<Either<Failure, List<DocumentEntity>>> getForProspect(
    String prospectId,
  );

  /// All documents the caller can see, joined to prospect-summary
  /// fields so the list view can render "doc-on-Jane-Smith" without
  /// a second round-trip. Uses an inner join with `prospects` so RLS
  /// on prospects filters the doc list down (a rufero only sees docs
  /// on prospects they're assigned to or have an appointment for).
  Future<Either<Failure, List<DocumentWithProspect>>> getMyDocuments();

  /// Calls the `generate-pdf` Edge Function. Returns the new doc row.
  Future<Either<Failure, DocumentEntity>> generatePdf({
    required String prospectId,
    required String templateKind, // '3rd_party_auth' | 'acv_contract' | 'rcv_contract' | 'supplement'
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
