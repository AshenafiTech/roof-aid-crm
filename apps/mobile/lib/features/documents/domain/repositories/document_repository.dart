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

  /// Absolute path to a locally-cached unsigned PDF for [documentId],
  /// or null if not cached. The preview page checks this first so it
  /// can hand a file path to the OS viewer when offline (or just
  /// faster on weak signal).
  Future<String?> localUnsignedPdfPath(String documentId);

  /// Absolute path to a locally-cached signed PDF, or null.
  Future<String?> localSignedPdfPath(String documentId);

  /// True when a signature was captured for [documentId] but the
  /// embed call hasn't drained yet. UI uses this to show a
  /// "Signature captured · syncing when online" indicator instead
  /// of the normal "Already signed" affordances.
  Future<bool> hasPendingSignature(String documentId);

  /// Returns an absolute local path to the document PDF, fetching +
  /// caching on demand if the local cache is empty OR stale. Falls
  /// back to null when there's no cache AND no network — caller
  /// should then surface an error or use [getSignedUrl] as a last
  /// resort.
  ///
  /// Pass [signed]=true to get the signed copy (or null if not yet
  /// signed), [signed]=false for the unsigned PDF.
  ///
  /// [serverUpdatedAt] is the doc row's `updated_at` from the server.
  /// When provided and newer than the locally-cached timestamp, the
  /// PDF is re-downloaded. This covers the two-party signing case
  /// where the same `signed_storage_path` holds the company-only PDF
  /// first and the fully-signed PDF after the homeowner signs — the
  /// path is identical but the bytes are different.
  Future<String?> ensureLocalPdfPath({
    required String documentId,
    required String storagePath,
    required bool signed,
    DateTime? serverUpdatedAt,
  });
}
