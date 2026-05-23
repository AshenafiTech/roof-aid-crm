# Stage 1 — Offline-First Data Layer & Sync Engine

**Depends on:** M5 sign-off, Hive already wired in `pubspec.yaml`.
**Blocks:** every other M6 stage.
**Estimated:** 3 days.

## Purpose

Establish the foundation that lets every screen read from local storage first and write to local storage first. The network becomes a background concern. After Stage 1 ships, no UI in the mobile app blocks on a Supabase call.

## Scope

### 1.1 Typed Hive boxes

Create typed adapters with `build_runner` for:

- **Cached reads** — `CachedProspect`, `CachedAppointment`, `CachedDocument`, `CachedInspectionReport`, `CachedUser` (self). Each carries an `updated_at` matching the server row.
- **Pending mutations** — `PendingStatusUpdate`, `PendingNote`, `PendingInspection`, `PendingSignature`. (`PendingPhoto` is Stage 2.) Each has `id`, `createdAt`, `attemptCount`, `lastError`, `clientObservedUpdatedAt`, plus the type-specific payload.
- **Versioning** — every Hive type has an explicit `int version` field. Adapters reject unknown versions instead of throwing.

File layout:
```
lib/core/offline/
  hive_setup.dart              # register all adapters, open all boxes on app start
  boxes.dart                   # named box references
  models/
    cached_prospect.dart       # @HiveType(typeId: 10)
    cached_appointment.dart    # @HiveType(typeId: 11)
    cached_document.dart       # @HiveType(typeId: 12)
    pending_status_update.dart # @HiveType(typeId: 30)
    pending_note.dart          # @HiveType(typeId: 31)
    pending_inspection.dart    # @HiveType(typeId: 32)
    pending_signature.dart     # @HiveType(typeId: 33)
```

> typeId convention: cached reads `10–29`, pending mutations `30–49`, leaves room for `PendingPhoto` (Stage 2 → `34`) and future types.

### 1.2 Repository pattern

Each existing feature repository (`ProspectsRepository`, `AppointmentsRepository`, `DocumentsRepository`, etc.) gets refactored to:

```dart
Stream<List<Prospect>> watchAssigned() {
  // emit cache immediately
  // kick background fetch
  // emit fresh on update
  return _box.watch().map(_decode).startWith(_box.values.toList());
}

Future<void> updateStatus(String prospectId, String status) async {
  // 1. apply optimistic update to Hive
  // 2. enqueue PendingStatusUpdate
  // 3. trigger sync runner (no await)
  // UI returns instantly
}
```

The BLoC layer collapses — most BLoCs become trivial mappers over the repository stream.

### 1.3 Sync engine

`lib/core/offline/sync_engine.dart` — one entry point, exposed via DI.

- One `SyncRunner` per pending box. Each runner has a `Mutex` so `flush()` is serial.
- Drains its queue oldest-first.
- On success → remove the item, write the canonical server row into the corresponding cached box.
- On failure → increment `attemptCount`, write `lastError`, schedule next attempt per backoff: `10s → 30s → 2m → 10m → 30m → 30m capped`.
- After 24h total elapsed since `createdAt` → mark item `status = 'hard_error'`. Stops auto-retrying. Surfaces in UI.

### 1.4 Connectivity observer

`connectivity_plus` stream → debounced 1s → fans out to all runners:
- `online` → call `flush()` on every runner
- `offline` → set runners to idle (no retries while offline; backoff timers paused)

### 1.5 Conflict resolution (last-write-wins + audit)

When a pending mutation reaches the server:
- Server compares incoming `clientObservedUpdatedAt` with current `updated_at`.
- If server `updated_at` is newer → **apply the mutation anyway** (last-write-wins) but write an `activities` row with `source = 'conflict_lost'` and a field-level diff: `{ field, before, after, overwritten_by }`.
- The mobile client never sees a conflict modal. Field UX rule: never block on a rooftop.

Server-side: a new RPC `apply_mutation_with_conflict_log(payload jsonb)` handles this uniformly. Migration `037_m6_conflict_logging.sql`.

### 1.6 Sync status indicator

A `SyncStatusBloc` exposes one of: `AllSynced` / `Syncing(int count)` / `Offline(int pending)` / `HasErrors(int count)`. The shell's app bar renders a compact pill bound to this state.

### 1.7 Debug "Sync log"

A rolling in-memory list of the last 100 sync events: `{timestamp, type, action, status, error?}`. Exposed via Settings → tap version number 5× → "Sync log" screen.

## Verification

1. Run app online → assigned prospects load → kill the app → enable airplane mode → cold launch → same prospects appear within 500ms from Hive
2. Update a prospect's status offline → status shows updated immediately → kill app → relaunch → still updated → enable network → server reflects within 30s
3. Queue 5 status updates while offline → enable network → sync indicator shows "Syncing 5…" → settles to "All synced"
4. Force a failure (point app at bad Supabase URL) → status update queues → backoff: 10s, 30s, 2m visible in Sync log → restore URL → next attempt succeeds
5. Concurrent edit chaos test: admin updates `prospect.status` on web while mobile has a queued update with older `clientObservedUpdatedAt` → mobile's update wins on flush → `activities` shows `conflict_lost` row with the admin's overwritten value
6. Chaos: toggle airplane mode every 200ms for 30s while queue has 10 items → after settle, exactly 10 items reach the server, none duplicated

## Files

### Created
- `apps/mobile/lib/core/offline/hive_setup.dart`
- `apps/mobile/lib/core/offline/boxes.dart`
- `apps/mobile/lib/core/offline/sync_engine.dart`
- `apps/mobile/lib/core/offline/sync_runner.dart`
- `apps/mobile/lib/core/offline/models/*.dart` (8 typed models + generated `.g.dart`)
- `apps/mobile/lib/core/offline/connectivity_observer.dart`
- `apps/mobile/lib/core/offline/sync_status_bloc.dart`
- `apps/mobile/lib/core/widgets/sync_status_pill.dart`
- `supabase/migrations/037_m6_conflict_logging.sql`
- `supabase/functions/_shared/apply-mutation.ts`

### Modified
- `apps/mobile/lib/features/*/data/repositories/*.dart` — refactor to Hive-first
- `apps/mobile/lib/features/shell/presentation/widgets/app_bar.dart` — mount sync pill
- `apps/mobile/lib/core/di/injection.dart` — register sync engine + runners

## Out of scope (this stage)
- Photo upload pipeline → Stage 2
- Background sync on iOS via BGTaskScheduler → M7
- Web parity → M-future
