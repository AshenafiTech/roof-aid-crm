import '../../domain/entities/note_entity.dart';

sealed class NotesEvent {
  const NotesEvent();
}

class NotesLoadRequested extends NotesEvent {
  final String prospectId;

  const NotesLoadRequested(this.prospectId);
}

class NotesStreamUpdated extends NotesEvent {
  final List<NoteEntity> notes;

  const NotesStreamUpdated(this.notes);
}

class NotesStreamFailed extends NotesEvent {
  final String message;

  const NotesStreamFailed(this.message);
}

class NoteSubmitRequested extends NotesEvent {
  final String body;

  const NoteSubmitRequested(this.body);
}

class NoteEditRequested extends NotesEvent {
  final String noteId;
  final String body;

  const NoteEditRequested({required this.noteId, required this.body});
}

class NoteDeleteRequested extends NotesEvent {
  final String noteId;

  const NoteDeleteRequested(this.noteId);
}
