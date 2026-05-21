import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../models/document_model.dart';

/// Raw "document + joined prospect name" row coming back from the
/// cross-prospect query. Stays in the data layer; the use case lifts
/// it to the domain `DocumentWithProspect`.
class DocumentWithProspectModel {
  final DocumentModel document;
  final String prospectName;

  const DocumentWithProspectModel({
    required this.document,
    required this.prospectName,
  });
}

abstract class DocumentRemoteDatasource {
  Future<List<DocumentModel>> fetchForProspect(String prospectId);

  /// Joined query — every doc the caller can see, with the prospect
  /// name attached. The `!inner` on the prospects join causes RLS
  /// on `prospects` to filter the doc list down (ruferos only see
  /// docs on prospects they can see).
  Future<List<DocumentWithProspectModel>> fetchMyDocuments();

  Future<DocumentModel> generatePdf({
    required String prospectId,
    required String templateKind,
    Map<String, dynamic>? fields,
  });

  Future<DocumentModel> embedSignature({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  });

  Future<String> getSignedUrl(String storagePath);
}

class DocumentRemoteDatasourceImpl implements DocumentRemoteDatasource {
  final SupabaseClient client;

  const DocumentRemoteDatasourceImpl(this.client);

  void _requireAuth() {
    if (client.auth.currentUser?.id == null) {
      throw ServerException('Not authenticated');
    }
  }

  @override
  Future<List<DocumentWithProspectModel>> fetchMyDocuments() async {
    _requireAuth();
    try {
      // `!inner` makes this an INNER JOIN — rows whose prospect is
      // hidden by RLS are dropped entirely.
      final response = await client
          .from('documents')
          .select('*, prospect:prospects!inner(id, name)')
          .order('created_at', ascending: false);
      return (response as List).map((r) {
        final map = r as Map<String, dynamic>;
        final prospect = map['prospect'] as Map<String, dynamic>?;
        return DocumentWithProspectModel(
          document: DocumentModel.fromMap(map),
          prospectName:
              (prospect?['name'] as String?) ?? 'Unknown prospect',
        );
      }).toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load documents: $e');
    }
  }

  @override
  Future<List<DocumentModel>> fetchForProspect(String prospectId) async {
    _requireAuth();
    try {
      final response = await client
          .from('documents')
          .select()
          .eq('prospect_id', prospectId)
          .order('created_at', ascending: false);
      return (response as List)
          .map((r) => DocumentModel.fromMap(r as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load documents: $e');
    }
  }

  @override
  Future<DocumentModel> generatePdf({
    required String prospectId,
    required String templateKind,
    Map<String, dynamic>? fields,
  }) async {
    _requireAuth();
    try {
      final response = await client.functions.invoke(
        'generate-pdf',
        body: {
          'prospect_id': prospectId,
          'template_kind': templateKind,
          'fields': ?fields,
        },
      );
      final data = response.data;
      if (response.status >= 400 || data == null) {
        throw ServerException(
          'generate-pdf failed (${response.status}): ${data ?? "no body"}',
        );
      }
      // Edge Function returns { document: {...} }.
      if (data is Map<String, dynamic> && data['document'] is Map) {
        return DocumentModel.fromMap(
          (data['document'] as Map).cast<String, dynamic>(),
        );
      }
      throw ServerException('Unexpected generate-pdf response: $data');
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      throw ServerException('Failed to generate document: $e');
    }
  }

  @override
  Future<DocumentModel> embedSignature({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  }) async {
    _requireAuth();
    try {
      final response = await client.functions.invoke(
        'embed-signature',
        body: {
          'document_id': documentId,
          'signature_png_base64': signaturePngBase64,
          'signer_name': signerName,
          'device_metadata': {
            'device_type': deviceType,
          },
        },
      );
      final data = response.data;
      if (response.status >= 400 || data == null) {
        throw ServerException(
          'embed-signature failed (${response.status}): ${data ?? "no body"}',
        );
      }
      // Edge Function returns { signed_document: {...} } OR { document: {...} }
      // depending on the deployed version. Accept either.
      if (data is Map<String, dynamic>) {
        final raw = data['signed_document'] ?? data['document'];
        if (raw is Map) {
          return DocumentModel.fromMap(raw.cast<String, dynamic>());
        }
      }
      throw ServerException('Unexpected embed-signature response: $data');
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      throw ServerException('Failed to embed signature: $e');
    }
  }

  @override
  Future<String> getSignedUrl(String storagePath) async {
    _requireAuth();
    try {
      final url = await client.storage
          .from('documents')
          .createSignedUrl(storagePath, 60 * 60);
      return url;
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is StorageException) throw ServerException(e.message);
      throw ServerException('Failed to get download link: $e');
    }
  }
}
