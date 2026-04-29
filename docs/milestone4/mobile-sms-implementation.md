# M4 Stage 7 — Mobile SMS implementation

## Purpose

Replace the M3 placeholder SMS tab on the prospect detail page with a full conversation view + composer that sends through the backend `send_sms` RPC. Realtime updates via Supabase channel. DNC / no-phone / cross-tenant enforcement reuses the server-side `can_message` RPC.

This is the **mobile-only** half of M4. The web softphone, web SMS module, web email, DNC enforcement on web, notification bell, and the backend RPCs / webhooks are all separate parallel work tracked in [docs/milestone4/](.).

## What was done

### New files (14)

**Domain layer**
- `domain/entities/sms_message_entity.dart` — entity mirroring `sms_logs` rows
- `domain/entities/can_message_verdict.dart` — typed `{allowed, reason}` + display copy
- `domain/repositories/sms_repository.dart` — abstract contract
- `domain/usecases/get_prospect_sms.dart`
- `domain/usecases/watch_prospect_sms.dart`
- `domain/usecases/send_prospect_sms.dart`
- `domain/usecases/check_can_message.dart`
- `domain/usecases/mark_prospect_sms_read.dart`

**Data layer**
- `data/models/sms_message_model.dart` — extends entity, parses joined agent name
- `data/datasources/sms_remote_datasource.dart` — fetch / watch / send (RPC) / canMessage (RPC) / markRead (RPC). Same offline-error pattern as `note_remote_datasource.dart` (catches `SocketException` etc., throws `NetworkException`)
- `data/repositories/sms_repository_impl.dart` — maps exceptions to `Failure`s

**Presentation layer**
- `presentation/bloc/sms_event.dart` — Load / StreamUpdated / StreamFailed / SendRequested / VerdictRefreshRequested
- `presentation/bloc/sms_state.dart` — Initial / Loading / Loaded(messages, verdict, isSubmitting, submitError, submitErrorTick) / Error(message, isOffline)
- `presentation/bloc/sms_bloc.dart` — same shape as `notes_bloc.dart`, optimistic prepend on send, fire-and-forget mark-read on tab open + every Realtime update
- `presentation/widgets/tabs/sms_tab.dart` — chat-style bubbles, auto-scroll, send button, blocked-state notice replacing composer when `verdict.allowed = false`

### Modified files (3)

- `core/di/injection_container.dart` — registers the 5 use cases, datasource, repository, and bloc factory
- `presentation/widgets/tabs/placeholder_tabs.dart` — `SmsTab` placeholder removed; class now lives in `sms_tab.dart`
- `presentation/pages/prospect_detail_page.dart` — SMS slot in `TabBarView` is now `BlocProvider<SmsBloc>(create: …)..add(SmsLoadRequested(prospect.id))` wrapping `const SmsTab()`

## Architecture decisions

### 1. RPC contract over direct table access for sends

Sending an SMS calls `client.rpc('send_sms', …)`, not `client.from('sms_logs').insert(…)`. The RPC enforces DNC + tenant scoping + Telnyx-call enqueueing in one server-side transaction. Mobile remains unaware of Telnyx and stays dependency-free.

### 2. Verdict object instead of a status string

`can_message` returns `{allowed, reason}`. The bloc stores the verdict on `SmsLoaded`; the composer reads `state.verdict.allowed` for enable/disable and `state.verdict.displayMessage` for the disabled-state copy. One source of truth per render.

### 3. Optimistic prepend on send + Realtime dedupe by id

After `send_sms` returns the new row, the bloc appends it to `messages` immediately (optimistic). When the Realtime subscription's refetch eventually reports the same id, `alreadyPresent` short-circuits — no duplicate.

### 4. Mark-read is fire-and-forget

`unawaited(_markRead(prospectId))` fires on tab open and on every Realtime update. The repository swallows errors silently (background hygiene action — never blocks the UI or surfaces a failure).

### 5. Composer hides itself only for hard blocks (DNC is a warning, not a block)

Per client policy (matches the M3-6 web deviation), **DNC does not block sending** — it's an *advisory* the agent acknowledges via the page-level `DncBanner` and chooses to override on a case-by-case basis (taking responsibility for the contact). The composer therefore stays enabled for DNC-flagged prospects.

The composer is only replaced with a disabled notice for **hard blocks**:

- `no_phone` — there's no number to send to
- `cross_tenant` — RLS permission failure
- `not_found` — prospect was deleted

The verdict's `blocksUi` getter encodes this: `!allowed && reason != 'dnc'`. The bloc's `_onSend` and the tab's composer-rendering both consult `blocksUi`, not `allowed`.

### 6. Auto-scroll only on growth

`_ThreadList.didUpdateWidget` only scrolls to bottom if message count grew or the last id changed. A delivery-status update on the existing tail doesn't yank the user away from older messages they're reading.

### 7. Failed sends keep the bubble visible

A `failed` row stays in the thread with a red border + error icon (instead of disappearing). The user can see what didn't go through. Retry-by-tap is a TODO when the backend exposes a `resend_sms` RPC.

## Backend dependencies (not yet deployed)

The mobile code targets these contracts from the M4 Stage 1 + Stage 3 plans:

| Surface | Status | Notes |
|---------|--------|-------|
| `sms_logs` table with `read_at`, `provider_message_id` columns | needs M4 Stage 1 migration | Most columns exist from M1; Stage 1 adds the rest |
| `can_message(p_prospect_id UUID) → jsonb` RPC | needs M4 Stage 1 | `{allowed, reason}` shape. **MUST NOT** return `allowed: false` for DNC — DNC is informational per client policy. Hard-block reasons only: `no_phone`, `cross_tenant`, `not_found` |
| `send_sms(p_prospect_id UUID, p_body TEXT) → UUID` RPC | needs M4 Stage 3 | Returns the new `sms_logs.id`. **MUST NOT** raise `sms_not_allowed: dnc`. Idempotency-key arg deferred — backend default works for v1 single-attempt sends |
| `mark_sms_read(p_prospect_id UUID) → void` RPC | needs M4 Stage 7 backend | Datasource silently no-ops if missing |
| Realtime publication on `sms_logs` | needs M4 Stage 3 | `ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs;` |

Until those land, the mobile build runs but the SMS tab will show empty state / errors. That's expected.

## Verification

- `flutter analyze` → no issues
- File count: 14 new + 3 modified
- Smoke test once backend is deployed:
  1. Open assigned prospect → SMS tab → spinner → empty state "No conversation yet"
  2. Type → tap send → bubble appears immediately as queued
  3. Within ~10s, status icon flips from `schedule` to `done`/`done_all`
  4. Send STOP from a real phone → tab refresh → DNC banner on prospect; composer replaced with "DNC flagged — replies blocked" notice
  5. Tab close + reopen → unread badge gone (mark-read runs)

## TODO (not blocking)

- Add `uuid` to `pubspec.yaml` and pass `p_idempotency_key` in `sendMessage` so a retry of the same tap doesn't produce two messages.
- Implement a "retry" tap on failed bubbles once a `resend_sms` RPC exists.
- Replace `Tab(text: 'SMS')` with a custom widget that shows an unread-count dot — needs a separate fetch, deferred.
- Localize `displayMessage` copy if the app gains i18n.
