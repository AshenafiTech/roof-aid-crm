# Mobile — Prospects Module (Stage 6, Phase 1)

## Purpose

Scaffold the **prospects** feature on the Flutter mobile app (Ruferos' primary
screen). This phase delivers the domain, data, and presentation layers for
the "Assigned Prospects" list with realtime Supabase sync, per
[docs/milestone2/stage-6-mobile-prospects.md](milestone2/stage-6-mobile-prospects.md).

## What was built

### Domain layer (`apps/mobile/lib/features/prospects/domain/`)
- `entities/prospect_entity.dart` — pure entity mirroring the `prospects`
  DB table (tenant_id, name, address, city, state, zip, phones, email,
  status, assigned_to, hail_size, home_value, do_not_call, timestamps).
  Exposes `displayAddress` and `primaryPhone` helpers.
- `repositories/prospect_repository.dart` — abstract contract with
  `getAssignedProspects()` (returns `Either<Failure, List<ProspectEntity>>`)
  and `watchAssignedProspects()` (returns a raw `Stream`).
- `usecases/get_assigned_prospects.dart`
- `usecases/watch_assigned_prospects.dart`

### Data layer (`apps/mobile/lib/features/prospects/data/`)
- `models/prospect_model.dart` — extends the entity, `fromMap` factory
  with null-safe parsing for timestamps, numerics, and the `phones` text[].
- `datasources/prospect_remote_datasource.dart` — abstract + `*Impl`.
  - `fetchAssigned()` → one-shot `.select().eq('assigned_to', userId)`.
  - `watchAssigned()` → Supabase `.stream(primaryKey: ['id']).eq(...)`,
    sorted locally by `created_at` desc.
- `repositories/prospect_repository_impl.dart` — wraps the datasource,
  converts `ServerException` → `ServerFailure`, passes the stream through.

### Presentation layer (`apps/mobile/lib/features/prospects/presentation/`)
- `bloc/prospects_event.dart` — sealed `ProspectsEvent`:
  `Load`, `Refresh`, `StreamUpdated`, `StreamFailed`.
- `bloc/prospects_state.dart` — sealed `ProspectsState`:
  `Initial`, `Loading`, `Loaded(prospects)`, `Error(message)`.
- `bloc/prospects_bloc.dart` — initial load + starts a `StreamSubscription`
  on the watch use case; cancels in `close()` to prevent leaks.
  Realtime errors do not wipe a loaded list.
- `pages/prospects_page.dart` — `BlocProvider` + Material scaffold with
  `RefreshIndicator`, empty state (pull-to-refresh still works),
  loading spinner, error view with retry, sign-out action.
- `widgets/prospect_list_tile.dart` — name/address/status chip row.
  Tapping shows a "Detail view ships in M3" snackbar (placeholder).

### Shared constants
- `apps/mobile/lib/core/constants/prospect_status.dart` — status values,
  labels, and colors. Kept in one place so list tiles, status filters,
  etc. all read from the same map.

### DI registration
- `apps/mobile/lib/core/di/injection_container.dart` — registered the
  datasource, repository, both use cases, and `ProspectsBloc`
  (as factory, matching `AuthBloc`).

## Key decisions

1. **Supabase `.stream()` as the single source of truth for realtime.**
   The BLoC runs one initial `fetchAssigned` for fast first paint, then
   subscribes to the stream — which also yields an initial snapshot +
   every change. Duplicate emissions are harmless (same list) and this
   matches the guidance in the stage-6 doc.
2. **Stream returns raw `Stream<List<ProspectEntity>>`, not `Either`.**
   Wrapping every realtime event in `Either` is friction with no upside.
   Errors surface via `Stream.onError` → `ProspectsStreamFailed` event.
3. **`phones` is `text[]`, not `phone: text`.** The blueprint entity in
   the stage-6 doc used a single `phone` string; the real DB schema
   (`supabase/migrations/002_core_tables.sql`) stores an array. The
   entity carries the full list and exposes `primaryPhone` for display.
4. **Local sort after stream map.** Supabase's stream helper only orders
   by the primary key, so we sort by `created_at desc` client-side after
   mapping to models.
5. **Stream subscription cancellation is first-class.** `ProspectsBloc.close()`
   cancels `_subscription`. Without this, every `BlocProvider` recreation
   leaks a subscription.

## Not yet done (follow-ups in this stage)

- **Routing** — `app.dart` still points authenticated users to
  `_DashboardPlaceholder`. Swap `/dashboard` for `/prospects` and have
  it build `ProspectsPage`.
- **Detail page (M3)** — tapping a tile currently shows a placeholder
  snackbar.
- **Widget tests** — none written yet.

## Verification checklist (from stage-6)

- [ ] Rufero logs in → lands on Prospects page showing assigned prospects
      *(blocked on routing wire-up)*
- [ ] Pull to refresh works
- [ ] Empty state shows when no prospects assigned
- [ ] Error state shows with retry button on failure
- [ ] Web status change → mobile list updates within 2 seconds
- [ ] Reassign away → prospect disappears; reassign to → prospect appears
- [ ] RLS verified cross-tenant
- [ ] No subscription leaks on navigate-away-and-back
