import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/document_entity.dart';
import '../repositories/document_repository.dart';

class GetMyDocuments {
  final DocumentRepository repository;

  const GetMyDocuments(this.repository);

  Future<Either<Failure, List<DocumentWithProspect>>> call() {
    return repository.getMyDocuments();
  }
}
