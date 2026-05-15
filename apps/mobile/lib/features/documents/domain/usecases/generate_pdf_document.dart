import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';
import '../repositories/document_repository.dart';

class GeneratePdfDocument {
  final DocumentRepository repository;

  const GeneratePdfDocument(this.repository);

  Future<Either<Failure, DocumentEntity>> call({
    required String prospectId,
    String templateKind = 'authorization',
    Map<String, dynamic>? fields,
  }) {
    return repository.generatePdf(
      prospectId: prospectId,
      templateKind: templateKind,
      fields: fields,
    );
  }
}
