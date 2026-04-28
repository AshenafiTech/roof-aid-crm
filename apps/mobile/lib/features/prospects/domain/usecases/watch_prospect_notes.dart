import '../entities/note_entity.dart';
import '../repositories/note_repository.dart';

class WatchProspectNotes {
  final NoteRepository repository;

  const WatchProspectNotes(this.repository);

  Stream<List<NoteEntity>> call(String prospectId) {
    return repository.watchNotes(prospectId);
  }
}
