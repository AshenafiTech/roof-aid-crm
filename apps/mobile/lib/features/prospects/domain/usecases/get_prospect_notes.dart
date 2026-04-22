import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/note_entity.dart';
import '../repositories/note_repository.dart';

class GetProspectNotes {
  final NoteRepository repository;

  const GetProspectNotes(this.repository);

  Future<Either<Failure, List<NoteEntity>>> call(String prospectId) {
    return repository.getNotes(prospectId);
  }
}
