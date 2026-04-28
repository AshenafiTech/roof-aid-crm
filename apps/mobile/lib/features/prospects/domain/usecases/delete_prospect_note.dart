import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/note_repository.dart';

class DeleteProspectNote {
  final NoteRepository repository;

  const DeleteProspectNote(this.repository);

  Future<Either<Failure, Unit>> call(String noteId) {
    return repository.deleteNote(noteId);
  }
}
