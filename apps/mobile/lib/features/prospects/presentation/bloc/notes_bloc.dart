import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/note_entity.dart';
import '../../domain/usecases/add_prospect_note.dart';
import '../../domain/usecases/delete_prospect_note.dart';
import '../../domain/usecases/get_prospect_notes.dart';
import '../../domain/usecases/update_prospect_note.dart';
import '../../domain/usecases/watch_prospect_notes.dart';
import 'notes_event.dart';
import 'notes_state.dart';

class NotesBloc extends Bloc<NotesEvent, NotesState> {
  final GetProspectNotes _getNotes;
  final WatchProspectNotes _watchNotes;
  final AddProspectNote _addNote;
  final UpdateProspectNote _updateNote;
  final DeleteProspectNote _deleteNote;

  String? _prospectId;
  StreamSubscription? _subscription;
  int _actionErrorTick = 0;

  NotesBloc({
    required GetProspectNotes getNotes,
    required WatchProspectNotes watchNotes,
    required AddProspectNote addNote,
    required UpdateProspectNote updateNote,
    required DeleteProspectNote deleteNote,
  })  : _getNotes = getNotes,
        _watchNotes = watchNotes,
        _addNote = addNote,
        _updateNote = updateNote,
        _deleteNote = deleteNote,
        super(const NotesInitial()) {
    on<NotesLoadRequested>(_onLoad);
    on<NotesStreamUpdated>(_onStreamUpdated);
    on<NotesStreamFailed>(_onStreamFailed);
    on<NoteSubmitRequested>(_onSubmit);
    on<NoteEditRequested>(_onEdit);
    on<NoteDeleteRequested>(_onDelete);
  }

  Future<void> _onLoad(
    NotesLoadRequested event,
    Emitter<NotesState> emit,
  ) async {
    _prospectId = event.prospectId;
    emit(const NotesLoading());

    final result = await _getNotes(event.prospectId);
    result.fold(
      (failure) => emit(NotesError(failure.message)),
      (notes) {
        emit(NotesLoaded(notes));
        _subscribe(event.prospectId);
      },
    );
  }

  void _onStreamUpdated(
    NotesStreamUpdated event,
    Emitter<NotesState> emit,
  ) {
    final current = state;
    if (current is NotesLoaded) {
      emit(current.copyWith(notes: event.notes));
    } else {
      emit(NotesLoaded(event.notes));
    }
  }

  void _onStreamFailed(
    NotesStreamFailed event,
    Emitter<NotesState> emit,
  ) {
    if (state is! NotesLoaded) emit(NotesError(event.message));
  }

  Future<void> _onSubmit(
    NoteSubmitRequested event,
    Emitter<NotesState> emit,
  ) async {
    final prospectId = _prospectId;
    final current = state;
    if (prospectId == null || current is! NotesLoaded) return;

    emit(current.copyWith(isSubmitting: true, clearSubmitError: true));

    final result = await _addNote(
      prospectId: prospectId,
      body: event.body,
    );
    result.fold(
      (failure) {
        // Keep the list untouched and surface the error on the composer.
        final latest = state;
        if (latest is NotesLoaded) {
          emit(
            latest.copyWith(isSubmitting: false, submitError: failure.message),
          );
        }
      },
      (note) {
        // Prepend the inserted note immediately so the user sees it without
        // waiting on the realtime stream. When the stream's refetch does
        // arrive, it returns the authoritative full list and replaces this
        // one wholesale — no duplicates.
        final latest = state;
        if (latest is NotesLoaded) {
          final alreadyPresent = latest.notes.any((n) => n.id == note.id);
          final merged = alreadyPresent
              ? latest.notes
              : [note, ...latest.notes];
          emit(
            latest.copyWith(
              notes: merged,
              isSubmitting: false,
              clearSubmitError: true,
            ),
          );
        }
      },
    );
  }

  Future<void> _onEdit(
    NoteEditRequested event,
    Emitter<NotesState> emit,
  ) async {
    final current = state;
    if (current is! NotesLoaded) return;

    // Snapshot for rollback, then optimistically swap the note body.
    final snapshot = current.notes;
    final optimistic = [
      for (final n in snapshot)
        if (n.id == event.noteId) _withBody(n, event.body) else n,
    ];
    emit(current.copyWith(notes: optimistic, clearActionError: true));

    final result = await _updateNote(noteId: event.noteId, body: event.body);
    result.fold(
      (failure) {
        final latest = state;
        if (latest is NotesLoaded) {
          emit(
            latest.copyWith(
              notes: snapshot,
              actionError: failure.message,
              actionErrorTick: ++_actionErrorTick,
            ),
          );
        }
      },
      (updated) {
        // Server-authoritative body — replace the optimistic copy.
        final latest = state;
        if (latest is NotesLoaded) {
          emit(
            latest.copyWith(
              notes: [
                for (final n in latest.notes)
                  if (n.id == updated.id) updated else n,
              ],
            ),
          );
        }
      },
    );
  }

  Future<void> _onDelete(
    NoteDeleteRequested event,
    Emitter<NotesState> emit,
  ) async {
    final current = state;
    if (current is! NotesLoaded) return;

    final snapshot = current.notes;
    final optimistic = [
      for (final n in snapshot)
        if (n.id != event.noteId) n,
    ];
    emit(current.copyWith(notes: optimistic, clearActionError: true));

    final result = await _deleteNote(event.noteId);
    result.fold(
      (failure) {
        final latest = state;
        if (latest is NotesLoaded) {
          emit(
            latest.copyWith(
              notes: snapshot,
              actionError: failure.message,
              actionErrorTick: ++_actionErrorTick,
            ),
          );
        }
      },
      (_) {
        // Realtime stream will re-confirm; nothing to do here.
      },
    );
  }

  NoteEntity _withBody(NoteEntity note, String body) {
    return NoteEntity(
      id: note.id,
      tenantId: note.tenantId,
      prospectId: note.prospectId,
      authorId: note.authorId,
      body: body,
      createdAt: note.createdAt,
      authorName: note.authorName,
    );
  }

  void _subscribe(String prospectId) {
    _subscription?.cancel();
    _subscription = _watchNotes(prospectId).listen(
      (notes) => add(NotesStreamUpdated(notes)),
      onError: (Object error) => add(NotesStreamFailed(error.toString())),
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
