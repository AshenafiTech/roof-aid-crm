import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';
import '../repositories/document_repository.dart';

class GetProspectDocuments {
  final DocumentRepository repository;

  const GetProspectDocuments(this.repository);

  Future<Either<Failure, List<DocumentEntity>>> call(String prospectId) {
    return repository.getForProspect(prospectId);
  }
}
