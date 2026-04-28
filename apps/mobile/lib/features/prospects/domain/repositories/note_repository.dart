import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/note_entity.dart';

abstract class NoteRepository {
  /// One-shot fetch of notes for a prospect, newest first.
  Future<Either<Failure, List<NoteEntity>>> getNotes(String prospectId);

  /// Live stream of notes for a prospect. Emits the initial snapshot and
  /// every subsequent insert/update/delete. Errors surface via `onError`.
  Stream<List<NoteEntity>> watchNotes(String prospectId);

  /// Insert a note written by the current user.
  Future<Either<Failure, NoteEntity>> addNote({
    required String prospectId,
    required String body,
  });

  /// Update an existing note. RLS only allows this for the author within
  /// 15 minutes of creation — outside that window a `Failure` is returned.
  Future<Either<Failure, NoteEntity>> updateNote({
    required String noteId,
    required String body,
  });

  /// Delete an existing note. Same RLS constraints as [updateNote].
  Future<Either<Failure, Unit>> deleteNote(String noteId);
}
