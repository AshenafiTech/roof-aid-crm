import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/document_entity.dart';
import '../../domain/repositories/document_repository.dart';
import '../datasources/document_remote_datasource.dart';

class DocumentRepositoryImpl implements DocumentRepository {
  final DocumentRemoteDatasource remote;

  const DocumentRepositoryImpl(this.remote);

  @override
  Future<Either<Failure, List<DocumentWithProspect>>> getMyDocuments() async {
    try {
      final list = await remote.fetchMyDocuments();
      return Right(
        list
            .map((r) => DocumentWithProspect(
                  document: r.document,
                  prospectName: r.prospectName,
                ))
            .toList(growable: false),
      );
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<DocumentEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, DocumentEntity>> generatePdf({
    required String prospectId,
    required String templateKind,
    Map<String, dynamic>? fields,
  }) async {
    try {
      final d = await remote.generatePdf(
        prospectId: prospectId,
        templateKind: templateKind,
        fields: fields,
      );
      return Right(d);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, DocumentEntity>> embedSignature({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  }) async {
    try {
      final d = await remote.embedSignature(
        documentId: documentId,
        signaturePngBase64: signaturePngBase64,
        signerName: signerName,
        deviceType: deviceType,
      );
      return Right(d);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, String>> getSignedUrl(String storagePath) async {
    try {
      final url = await remote.getSignedUrl(storagePath);
      return Right(url);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
