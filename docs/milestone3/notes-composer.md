# Notes Composer — Prospect Detail (M3)

## Purpose

The **Notes** tab on the prospect detail page was a placeholder — it showed
"note composer ships in a follow-up pass". This work ships that pass: a real
note feed backed by the `notes` table, with a compose field at the bottom of
the tab and realtime updates so multiple Ruferos looking at the same prospect
see each other's entries immediately.

Scope is intentionally narrow: read + write plain-text notes. Activity log
rows (`activities.type = 'note_added'`) that the web app writes are **not**
duplicated from mobile — a future DB trigger will own that so we don't have
two write paths racing the same audit row.

## Architecture

Clean-architecture layering, matching the Prospects feature that already
exists next door.

```
presentation/
  bloc/
    notes_bloc.dart          ← orchestrates load + submit + stream
    notes_event.dart         ← sealed: Load / StreamUpdated / StreamFailed / SubmitRequested
    notes_state.dart         ← sealed: Initial / Loading / Loaded / Error
  widgets/tabs/
    notes_tab.dart           ← UI: feed + composer + error

domain/
  entities/note_entity.dart
  repositories/note_repository.dart
  usecases/
    get_prospect_notes.dart
    watch_prospect_notes.dart
    add_prospect_note.dart

data/
  models/note_model.dart            ← fromMap with joined author
  datasources/note_remote_datasource.dart
  repositories/note_repository_impl.dart
```

All registrations live in `core/di/injection_container.dart` under the new
`── Notes Feature ──` block.

## Data flow

1. `ProspectDetailPage` creates a `BlocProvider<NotesBloc>` per prospect that
   dispatches `NotesLoadRequested(prospect.id)` on build.
2. `NotesBloc._onLoad` fires `GetProspectNotes` (one-shot fetch) and on
   success emits `NotesLoaded` + opens the realtime subscription via
   `WatchProspectNotes`.
3. Supabase `postgres_changes` fires on any insert/update/delete for rows
   where `prospect_id = $prospectId` → datasource re-fetches the joined
   list and pushes it through the stream.
4. The bloc forwards stream emissions to `NotesStreamUpdated`, which
   `copyWith`s the `NotesLoaded` state so the composer's `isSubmitting` /
   `submitError` flags are preserved across list refreshes.
5. Submit path: `NoteSubmitRequested(body)` → `AddProspectNote` →
   datasource `.insert(...).select('*, author:users!author_id(...)').single()`.
   On success the bloc just flips `isSubmitting` off; the new row arrives
   through the realtime channel (no optimistic insert → no duplicate rows).

## Author name

`NoteModel.fromMap` parses a joined `author:users!author_id(first_name,
last_name)` payload and flattens it into `authorName`. Insert re-selects
with the same join so the inserted row comes back already populated —
avoids a "Unknown" flash while realtime catches up.

## Tenant id

Notes carry `tenant_id` for RLS. The mobile datasource looks up the
current user's `users.tenant_id` once per insert and includes it in the
payload. This mirrors what the existing Prospects datasource does.

## UI

`NotesTab` is a `Column`:

- **Feed** (`Expanded`) — `ListView.separated` with newest first. Each
  `_NoteCard` shows author avatar (initials) + name, relative timestamp
  ("2h ago"), and body. Empty state uses the shared `EmptyState` widget
  with a field-friendly copy ("Add the first note about this prospect…").
- **Composer** (`_NoteComposer`) — pill-shaped text field (1-4 lines,
  auto-grow) + circular send button. Send stays disabled while the field
  is empty or a submit is in flight. A spinner replaces the arrow during
  submit. On success the field clears (detected via `didUpdateWidget`:
  `isSubmitting` went true → false with no new error).
- **Submit error banner** — surfaces inline above the composer using
  `errorContainer` tones; the feed stays untouched so the user never
  loses context while fixing the error.

## Realtime vs polling

Prospects polls periodically because RLS can *revoke* an assignment
(assigned_user_id changes → the row disappears from the user's scope),
and Postgres won't emit a delete-style event for that. Notes don't
have that problem: RLS for notes is scoped by tenant + assignment on the
parent prospect, but once a note is visible to the user it stays visible
to them. So no poll — just the realtime channel + the initial fetch.

## DI

```dart
// ── Notes Feature ─────────────────────────────────────────
sl.registerLazySingleton<NoteRemoteDatasource>(
  () => NoteRemoteDatasourceImpl(sl()),
);
sl.registerLazySingleton<NoteRepository>(() => NoteRepositoryImpl(sl()));
sl.registerLazySingleton(() => GetProspectNotes(sl()));
sl.registerLazySingleton(() => WatchProspectNotes(sl()));
sl.registerLazySingleton(() => AddProspectNote(sl()));
sl.registerFactory(
  () => NotesBloc(getNotes: sl(), watchNotes: sl(), addNote: sl()),
);
```

Bloc is a `registerFactory` so each prospect detail page gets a fresh
instance (and therefore its own realtime subscription that's disposed
with the widget).

## Changes to existing files

- `widgets/tabs/placeholder_tabs.dart` — `NotesTab` stub removed.
- `pages/prospect_detail_page.dart` — imports `BlocProvider`, `sl`, and
  the real `NotesTab`; wraps it in `BlocProvider<NotesBloc>(create: (_) =>
  sl<NotesBloc>()..add(NotesLoadRequested(prospect.id)))` inside the
  `TabBarView`.

## Decisions / notes

- **No optimistic insert.** Faster feel on paper, but the realtime echo
  would then need to dedupe by id — more moving parts for a UX that's
  already ~200ms end-to-end.
- **No activity log write.** Moved to a future DB trigger to keep a single
  source of truth; avoids drift if the web app changes the shape of
  `activities.type = 'note_added'`.
- **Relative timestamp only on the card.** Rolls into absolute
  (`M/D/YY`) after 7 days — matches the web's note list style.

## Verification

- `flutter analyze` clean.
- Manual: open a prospect → Notes tab → empty state renders → type +
  send → row appears in the feed via realtime, composer clears, spinner
  clears.
