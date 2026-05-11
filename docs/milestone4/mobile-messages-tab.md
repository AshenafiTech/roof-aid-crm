# M4 — Mobile Messages tab (SMS inbox)

## Purpose

Replace the placeholder Messages tab in the bottom navigation with an
inbox-style list of SMS conversations: one row per prospect with at least
one SMS, ordered by most-recent activity, tap → opens the prospect's
detail page on the SMS tab.

This is a **temporary client-side aggregation** of `sms_logs`. The
repository contract is shaped so the datasource can later be swapped for a
backend `get_sms_conversations()` RPC without touching the bloc, page, or
tile widget.

## What was done

### New feature folder `apps/mobile/lib/features/messages/`

**Domain layer**
- `domain/entities/sms_conversation_entity.dart` — one inbox row.
  Embeds a full `ProspectEntity` so tapping a tile can navigate into the
  existing `ProspectDetailPage` without a second fetch.
- `domain/repositories/conversations_repository.dart` — abstract contract.
- `domain/usecases/get_conversations.dart`
- `domain/usecases/watch_conversations.dart`

**Data layer**
- `data/datasources/conversations_remote_datasource.dart` — fetches up to
  500 most-recent `sms_logs` rows joined to `prospects` and aggregates in
  dart. Walks the DESC-ordered rows, keeps the first row seen per
  `prospect_id` (= latest in thread), counts unread inbound messages per
  prospect for the badge. Subscribes to `sms_logs` Realtime; any change
  triggers a refetch.
- `data/repositories/conversations_repository_impl.dart` — maps
  `NetworkException` / `ServerException` to `NetworkFailure` /
  `ServerFailure`, matching the SMS feature's pattern.

**Presentation layer**
- `presentation/bloc/conversations_bloc.dart` + `_event.dart` + `_state.dart`
  — initial load + Realtime stream subscription. Same shape as `SmsBloc`.
- `presentation/widgets/conversation_tile.dart` — chat-list style row
  with circle avatar (initials), prospect name, last message preview,
  relative timestamp, unread-count badge. Outbound-last messages show a
  small reply arrow to disambiguate from inbound.
- `presentation/pages/messages_page.dart` — owns the list + empty state +
  error view with retry. Pull-to-refresh re-issues `ConversationsLoadRequested`.

### Modified files

- `core/di/injection_container.dart` — registers the new datasource,
  repository, two use cases, and the bloc factory.
- `features/shell/main_shell.dart` — replaces the `PlaceholderPage` for
  Messages with `BlocProvider<ConversationsBloc>(create: ..)..add(ConversationsLoadRequested())`
  wrapping `const MessagesPage()`.
- `features/prospects/presentation/pages/prospect_detail_page.dart` — adds
  an `initialTabIndex` constructor param (default 0). The Messages tab
  passes `3` to land on SMS directly.

## Architecture decisions

### 1. Server-side aggregation via `get_sms_conversations()` RPC

Migration `024_get_sms_conversations_rpc.sql` defines a `SETOF jsonb` RPC
that returns one row per prospect with an SMS history. Each row contains
the full prospects record (as nested JSON) plus the latest message body,
timestamp, direction, status, and unread inbound count. Rows are ordered
by activity DESC so the UI doesn't need to sort.

Tenant scoping: `SECURITY INVOKER` + RLS on both `sms_logs` and
`prospects`. The function does not filter by `tenant_id` explicitly —
the caller's row-level policies do.

The datasource ([conversations_remote_datasource.dart:25-43](../../apps/mobile/lib/features/messages/data/datasources/conversations_remote_datasource.dart#L25-L43))
calls `client.rpc('get_sms_conversations')` and parses the jsonb rows
via `_parseRpcRows`. The prospect blob is passed straight through
`ProspectModel.fromMap` — same parser the rest of the app uses, so the
`coordinates` point string, phone array, and date columns all decode
identically.

**Earlier iteration (replaced):** before the RPC existed, this fetched
the 500 most-recent `sms_logs` rows joined to `prospects` and grouped in
dart. That worked for a demo but capped silently and did extra
round-trip data transfer. The RPC removes the cap and shrinks the wire
payload to one row per prospect.

### 2. Embed `ProspectEntity` in the conversation row

Two reasons:

- Tapping a tile must open `ProspectDetailPage`, which requires a full
  `ProspectEntity`. Pre-loading it as part of the inbox fetch avoids an
  extra round-trip on every tap.
- The `do_not_call` / `do_not_call_reason` are needed for the
  `DncBanner` on the detail page; carrying them on the conversation row
  means the banner renders instantly on tap.

The join is `*, prospect:prospects!inner(*)` — RLS scopes both tables.

### 3. Realtime subscription is tenant-wide, not per-prospect

The detail page's SMS thread subscribes per-prospect; this inbox
subscribes to *all* `sms_logs` changes the caller can see (RLS already
filters to their tenant). Each insert/update triggers a debounced refetch
of the full conversation list. Fine for the row volume we expect; if it
becomes chatty, add a tenant-id filter or coalesce refetches.

### 4. `initialTabIndex` on `ProspectDetailPage`

A simple optional param with default `0` (Overview). The Messages tab
passes `3` (SMS). `DefaultTabController(initialIndex: ...)` handles the
rest. This avoids a separate `ProspectSmsPage` route or any conditional
logic in the existing tab layout.

### 5. Unread-count badge from `sms_logs.read_at`

`read_at` is populated by the `mark_sms_read` RPC the SMS tab fires on
open and on every Realtime tick. So opening a thread clears the badge
across the inbox automatically — no extra coordination needed.

## Acceptance checks

- [ ] Sign in as a rufero whose tenant has at least one prospect with SMS
      history → Messages tab shows that prospect.
- [ ] Newer messages from another prospect → that prospect floats to
      the top of the list on the next Realtime tick.
- [ ] Tap a row → lands on the prospect's detail page with the SMS tab
      already selected; thread loads.
- [ ] Inbound message from an unknown prospect → if `prospect_id` is
      null the row is filtered out by the inner join; admin triage of
      such rows is M7 work (per the M4 plan).
- [ ] Tenant with no SMS history → empty state with the "Send the first
      SMS from a prospect's detail page" copy.
- [ ] Pull-to-refresh re-issues the fetch; offline → retry button on the
      error view re-tries when connectivity returns.

## Deployment

After `git pull` on a fresh DB, run:

```
supabase db push   # or paste 024_get_sms_conversations_rpc.sql in the SQL Editor
```

Quick verify from the SQL Editor (as an authenticated user so RLS is
applied):

```sql
SELECT * FROM get_sms_conversations() LIMIT 5;
```

You should see jsonb rows, each with `prospect`, `last_body`, `last_at`,
`last_direction`, `last_status`, `unread_count`.

## Verification

- `flutter analyze` → clean.
- File count: 11 new + 3 modified.
- Branch: `feat/m4-mobile-update` (forked from `dev`).
