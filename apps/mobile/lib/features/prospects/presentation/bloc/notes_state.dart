import '../../domain/entities/note_entity.dart';

sealed class NotesState {
  const NotesState();
}

class NotesInitial extends NotesState {
  const NotesInitial();
}

class NotesLoading extends NotesState {
  const NotesLoading();
}

/// Notes have been loaded for the current prospect. `isSubmitting` flips on
/// while a new note is being posted — the list stays visible underneath so
/// the user can still see history while they wait.
class NotesLoaded extends NotesState {
  final List<NoteEntity> notes;
  final bool isSubmitting;
  final String? submitError;

  /// Transient error for edit/delete — surfaced as a SnackBar by the UI
  /// and cleared on the next successful action. Scoped separately from
  /// [submitError] so a failed delete doesn't clobber the composer.
  final String? actionError;

  /// Monotonically increasing counter so the UI can distinguish two
  /// consecutive errors with identical messages ("Edit window has
  /// expired" twice in a row) and still show the second SnackBar.
  final int actionErrorTick;

  const NotesLoaded(
    this.notes, {
    this.isSubmitting = false,
    this.submitError,
    this.actionError,
    this.actionErrorTick = 0,
  });

  NotesLoaded copyWith({
    List<NoteEntity>? notes,
    bool? isSubmitting,
    String? submitError,
    bool clearSubmitError = false,
    String? actionError,
    bool clearActionError = false,
    int? actionErrorTick,
  }) {
    return NotesLoaded(
      notes ?? this.notes,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
      actionError: clearActionError ? null : (actionError ?? this.actionError),
      actionErrorTick: actionErrorTick ?? this.actionErrorTick,
    );
  }
}

class NotesError extends NotesState {
  final String message;

  const NotesError(this.message);
}
