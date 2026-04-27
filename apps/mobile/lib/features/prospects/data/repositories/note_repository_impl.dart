import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/note_entity.dart';
import '../../domain/repositories/note_repository.dart';
import '../datasources/note_remote_datasource.dart';

class NoteRepositoryImpl implements NoteRepository {
  final NoteRemoteDatasource remoteDatasource;

  const NoteRepositoryImpl(this.remoteDatasource);

  @override
  Future<Either<Failure, List<NoteEntity>>> getNotes(String prospectId) async {
    try {
      final notes = await remoteDatasource.fetchForProspect(prospectId);
      return Right(notes);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<NoteEntity>> watchNotes(String prospectId) {
    return remoteDatasource.watchForProspect(prospectId);
  }

  @override
  Future<Either<Failure, NoteEntity>> addNote({
    required String prospectId,
    required String body,
  }) async {
    try {
      final note =
          await remoteDatasource.addNote(prospectId: prospectId, body: body);
      return Right(note);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, NoteEntity>> updateNote({
    required String noteId,
    required String body,
  }) async {
    try {
      final note =
          await remoteDatasource.updateNote(noteId: noteId, body: body);
      return Right(note);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> deleteNote(String noteId) async {
    try {
      await remoteDatasource.deleteNote(noteId);
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
