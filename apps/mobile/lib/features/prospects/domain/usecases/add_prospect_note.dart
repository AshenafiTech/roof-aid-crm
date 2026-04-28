import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/note_entity.dart';
import '../repositories/note_repository.dart';

class AddProspectNote {
  final NoteRepository repository;

  const AddProspectNote(this.repository);

  Future<Either<Failure, NoteEntity>> call({
    required String prospectId,
    required String body,
  }) {
    return repository.addNote(prospectId: prospectId, body: body);
  }
}
