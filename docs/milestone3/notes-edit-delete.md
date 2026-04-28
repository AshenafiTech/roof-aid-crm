# Notes — Author Edit / Delete (15-min window)

Follow-up to [notes-composer.md](./notes-composer.md). The composer shipped
notes as append-only, matching the web app. This pass adds a short edit +
delete window so an author can fix typos or remove a misfired note without
breaking the audit trail for anyone else.

## Policy

- **Who:** only the note's author.
- **When:** within 15 minutes of `created_at`. After that the note is
  locked to everyone (including the author).
- **What changes:** the note body. No other fields are editable.
- **Who enforces:** Postgres RLS — the mobile app only mirrors the gate in
  the UI. Attempting to edit/delete outside the window server-rejects
  cleanly; the bloc surfaces the rejection as a SnackBar.

## RLS

[supabase/migrations/009_notes_edit_delete_rls.sql](../../supabase/migrations/009_notes_edit_delete_rls.sql):

```sql
CREATE POLICY "notes_update" ON notes FOR UPDATE
USING (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
  AND created_at > now() - interval '15 minutes'
) WITH CHECK (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
);

CREATE POLICY "notes_delete" ON notes FOR DELETE
USING (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
  AND created_at > now() - interval '15 minutes'
);
```

Tenant scope is re-checked on both USING and WITH CHECK so a stale session
can't reach across tenants. `author_id = auth.uid()` binds to the current
authenticated user; the `users.id = auth.users.id` invariant from the
original schema is what lets this work.

## Mobile layering

```
domain/
  repositories/note_repository.dart     ← +updateNote, +deleteNote
  usecases/
    update_prospect_note.dart           ← NEW
    delete_prospect_note.dart           ← NEW

data/
  datasources/note_remote_datasource.dart  ← +updateNote, +deleteNote
  repositories/note_repository_impl.dart   ← wrap + Either<Failure, …>

presentation/bloc/
  notes_event.dart    ← +NoteEditRequested, +NoteDeleteRequested
  notes_state.dart    ← +actionError, +actionErrorTick
  notes_bloc.dart     ← +_onEdit (optimistic + rollback)
                       +_onDelete (optimistic + rollback)
```

## Datasource: distinguishing RLS rejection from real failure

Because UPDATE/DELETE on a row an RLS policy hides simply returns 0 rows
(not an error), the datasource has to read the affected rows back and
treat "zero rows" as "window expired":

- **Update:** `.update(...).eq('id', id).select(join).maybeSingle()` →
  `null` ⇒ throw `ServerException('Edit window has expired')`.
- **Delete:** `.delete().eq('id', id).select('id')` → empty list ⇒ throw
  `ServerException('Delete window has expired')`.

This means the user sees a real, actionable error instead of a silent
no-op.

## Bloc: optimistic + rollback

Both edit and delete follow the same shape:

1. Snapshot the current `notes` list.
2. Emit an optimistically-mutated list (edit: replace body; delete:
   remove by id). Clear any prior `actionError`.
3. Call the use case.
4. On success: for edits, replace the optimistic entry with the
   server-authoritative `NoteEntity` returned by the update. For deletes,
   do nothing (realtime will re-confirm).
5. On failure: restore the snapshot, set `actionError` to the failure
   message, and bump `actionErrorTick` so consecutive identical messages
   still trigger a SnackBar.

`actionError` is scoped separately from the composer's `submitError` so a
failed delete doesn't clobber a composer error.

## UI

[notes_tab.dart](../../apps/mobile/lib/features/prospects/presentation/widgets/tabs/notes_tab.dart)

- Each `_NoteCard` computes `canMutate` as
  `currentUserId == note.authorId && now - createdAt <= 15min`. When
  true, a `PopupMenuButton` (⋯) appears in the card header with Edit +
  Delete entries.
- Edit opens a dialog with a pre-filled multi-line text field. Save
  dispatches `NoteEditRequested`; empty or unchanged input dispatches
  nothing.
- Delete opens an `AlertDialog` confirmation with a destructive styled
  "Delete" button.
- A `BlocListener` watches `actionError` and surfaces it via
  `ScaffoldMessenger` as a floating SnackBar (3 s).
- `currentUserId` comes from `AuthBloc.state as AuthAuthenticated` —
  already provided higher up in the app tree.

## Edge case: user sits on the screen past the window

The card computes `canMutate` at build time, not on a timer. If the
user opens the tab at 14:58 remaining and taps Edit at 15:01, the popup
was still visible — but the server returns "Edit window has expired"
and the SnackBar surfaces the message. Deliberate trade-off: no global
ticker needed, UX cost is one misfired tap per screen-sit.

## DI

Two more `registerLazySingleton` entries + expanded `NotesBloc` factory
args in [injection_container.dart](../../apps/mobile/lib/core/di/injection_container.dart):

```dart
sl.registerLazySingleton(() => UpdateProspectNote(sl()));
sl.registerLazySingleton(() => DeleteProspectNote(sl()));

sl.registerFactory(
  () => NotesBloc(
    getNotes: sl(),
    watchNotes: sl(),
    addNote: sl(),
    updateNote: sl(),
    deleteNote: sl(),
  ),
);
```

## Verification

- `flutter analyze` clean.
- Manual path:
  - Post a note → menu (⋯) appears → Edit → body changes live.
  - Post a note → Delete → confirm → note leaves the list.
  - Browse another Rufero's note → no menu.
  - Wait 15 min → own menu disappears on next state change, and if the
    user races the clock the server rejects with a SnackBar.
