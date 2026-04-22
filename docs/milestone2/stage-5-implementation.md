# Milestone 2 — Stage 5 Implementation

## Purpose

Wire Supabase Realtime so the prospects list, the prospect detail, the dashboard, and the top-bar notification bell all refresh without a manual reload. The strategy is intentionally dumb: subscribe → `router.refresh()` → let the Server Component re-render from the new DB state. No client-side store, no optimistic updates, no diff-merging.

## What was built

### Shared hook

`apps/web/lib/hooks/use-realtime-refresh.ts` — a single `useRealtimeRefresh({ table, filter?, event?, onEvent? })` hook. Subscribes to `postgres_changes`, invokes the optional `onEvent` callback, then calls `router.refresh()` so the server component re-renders. Cleans up via `supabase.removeChannel(channel)` in `useEffect`'s return — forgetting that is the number-one memory-leak trap in Supabase apps. Channel names include the filter + event so duplicate subscriptions don't collide.

### Realtime mounts

| Route | Component | Subscriptions |
|-------|-----------|---------------|
| `/prospects` | `prospects/realtime-refresh.tsx` (was a stub in Stage 2) | `prospects` filtered by `tenant_id=eq.{user.tenantId}` |
| `/prospects/[id]` | `prospects/[id]/realtime-refresh.tsx` | `prospects id=eq.{id}`, `activities prospect_id=eq.{id}`, `notes prospect_id=eq.{id}` |
| `/` (dashboard) | `(dashboard)/dashboard-realtime.tsx` | `prospects tenant_id=eq.{tid}`, `activities tenant_id=eq.{tid}`, `notifications user_id=eq.{uid}` |

Each realtime component is `"use client"`, renders `null`, and is placed at the bottom of the server page so subscriptions don't interfere with suspense boundaries.

### Notification bell

`apps/web/app/(dashboard)/notification-bell.tsx` — `Bell` icon in the top bar with a count badge. Flow:
1. `(dashboard)/layout.tsx` fetches `getUnreadNotificationCount(user.id)` and passes it to `DashboardShell` as `unreadCount`.
2. `DashboardShell` renders `<NotificationBell userId initialCount={unreadCount} />` between the role label and the display name.
3. The bell subscribes to `notifications` filtered to `user_id=eq.{uid}`. On `INSERT` with `is_read === false` it optimistically bumps the local count for instant feedback; on `UPDATE` / `DELETE` (mark-read) it calls `router.refresh()` so the layout refetches the authoritative count.
4. Clicking the bell triggers `router.refresh()`. The full dropdown (list, mark-read UI, deep link into the record) lands in M4.

Badge caps at `99+`; no badge when count is zero.

### Publication migration

`supabase/migrations/007_enable_realtime.sql` — idempotent `DO` block that adds `prospects`, `notifications`, `activities`, and `notes` to the `supabase_realtime` publication. It only runs `ALTER PUBLICATION … ADD TABLE` when the table isn't already there, so it's safe to re-run.

**This migration has not been applied yet** — the environment has no Supabase CLI or `psql`. Two easy paths to apply it:
- Paste the SQL into Supabase Studio → SQL Editor → Run, or
- Toggle the three tables on in Supabase Studio → Database → Replication.

Until one of those happens, subscriptions connect cleanly but no events fire, so the UI behaves exactly like Stage 4. After enabling, updates become live with no code redeploy.

## Key decisions

- **Refresh-based, not state-based.** `router.refresh()` re-runs the server component, which re-fetches with the authoritative query. We never maintain a separate client-side cache of prospects/activities, so there's no divergence to debug. The cost is one extra round-trip per event — fine at the expected write volume.
- **RLS is the tenant wall.** Realtime respects RLS on reads, so even without the explicit `tenant_id=eq.{tid}` filter, cross-tenant events wouldn't leak. The filter is primarily an efficiency knob: the server doesn't broadcast events we'd just drop.
- **Notification bell opts into local-state optimism.** The count badge needs to react in under a second to feel live; waiting for a round-trip refresh would lag. For new `INSERT`s we increment locally; for `UPDATE`/`DELETE` (mark-read) we fall back to `router.refresh()` because the "what is this row's new read state" question is best answered by re-fetching. The authoritative count comes from the layout's server-side query.
- **One `useRealtimeRefresh` per subscription, not per row.** The detail page mounts three hooks (prospect/activities/notes) because each has a distinct filter; we never create one channel per row.
- **Migration is idempotent.** Using a `DO` block with existence checks means re-running on partial application doesn't error or double-add tables.
- **Casted types on `postgres_changes`.** The `@supabase/supabase-js` event typings don't expose a clean generic for `postgres_changes` payloads; the hook casts the `event` string and filter object to `never` with a comment. This is the documented API, and the casts are scoped to the hook.

## Verification

- `pnpm build` — clean, 14 routes, TypeScript passes. Pre-existing `middleware → proxy` warning only.
- **Manual smoke tests require the publication migration to be applied first.** After running `007_enable_realtime.sql` in Supabase Studio:
  - Open `/prospects` in tab A (NWA owner), `/prospects/[id]` in tab B (same user).
  - Change status in tab B → tab A's row updates within 1–2 seconds.
  - Add a note in tab B → tab B's Activity and Notes tabs refresh; tab A row updates (because `prospects.updated_at` triggers refresh via the prospect subscription — if not, the Recent Activity card on the dashboard still picks it up via the activities channel).
  - Insert a `notifications` row in Studio for the signed-in user → the top-bar bell badge increments without any UI interaction.
  - Sign in as an Ozark user in another browser → tab A events never cross the tenant boundary.

## Not in Stage 5

- Full notifications dropdown (list, mark-read, "clear all") → M4.
- Debounced refresh for high-throughput events → premature for M2 traffic, revisit if we ever see tight update loops.
- Presence / typing indicators → out of M2 scope entirely.
- Automated realtime tests (Playwright) → deferred.

## Pitfalls worth flagging for later stages

- **Realtime is mute until the publication migration runs.** Stage 5 code is safe to merge before it runs — subscriptions simply receive no events. Call this out in release notes and run `007_enable_realtime.sql` in Studio during the Stage 5 deploy.
- **`router.refresh()` cascades.** Every hook triggers a full Server-Component re-render for its route, which means three hooks on the detail page can fire three refreshes from one logical update. Cheap for now; if it ever gets loud, coalesce via a shared debounced refresher.
- **Event payload typings are loose.** When we eventually want to act on `payload.new` / `payload.old` (e.g., for optimistic notification insertion), narrow the types at the call site rather than trying to improve the hook's generics — the library's generic story is still in flux.
- **New tables need republishing.** If M3 adds `calls` or `messages` tables and we want them live, add them to `supabase_realtime` in a new migration rather than editing `007_enable_realtime.sql`.
- **Channel-name collisions.** Our channel name is `realtime:{table}:{filter}:{event}` — unique enough for the current subscriptions, but if two components ever subscribe to the exact same `(table, filter, event)` triple on the same page, the second `supabase.channel(name)` returns the existing channel rather than a fresh one. Add a consumer ID to the name if that ever becomes a real case.
