import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/note_entity.dart';
import '../repositories/note_repository.dart';

class UpdateProspectNote {
  final NoteRepository repository;

  const UpdateProspectNote(this.repository);

  Future<Either<Failure, NoteEntity>> call({
    required String noteId,
    required String body,
  }) {
    return repository.updateNote(noteId: noteId, body: body);
  }
}
