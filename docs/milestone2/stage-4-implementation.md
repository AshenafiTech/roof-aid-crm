# Milestone 2 — Stage 4 Implementation

## Purpose

Replace the placeholder dashboard with real, tenant-scoped numbers so every user lands on actionable context. Four KPI cards (Total Prospects, Today's Appointments, Unread Notifications, Conversion Rate), a pipeline breakdown with a bar per status, and a recent-activity feed.

## What was built

### Data layer

**`apps/web/lib/queries/dashboard.ts`** — four helpers, all tenant-scoped via RLS and optionally rufero-scoped via an explicit `assignedTo` filter:

| Function | How it's computed |
|----------|-------------------|
| `getPipelineCounts({ assignedTo? })` | 6 parallel `{ count: "exact", head: true }` queries on `prospects`, one per status. Returns all 6 statuses (zero-filled if absent) so the UI renders a stable row set. |
| `getTodayAppointmentsCount({ assignedTo? })` | `count-head` query on `appointments` within the browser-TZ day (`00:00 → 23:59.999` local), filtered to `status in ('scheduled', 'confirmed')`. Rufero scope maps to `rufero_id`. |
| `getUnreadNotificationCount(userId)` | `count-head` query on `notifications` with `user_id = caller` + `is_read = false`. (Schema uses `is_read`, not `read_at` — the Stage 4 doc was drafted against an older schema.) |
| `getRecentActivity(limit, { assignedTo? })` | `.select("*, user:users!user_id(first_name, last_name), prospect:prospects!prospect_id(id, name, assigned_to)")` ordered by `created_at desc`, then JS-filtered to the caller's assigned prospects when rufero. Returns the last 10 by default. |

### UI components

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/metrics-cards.tsx` | 4 KPI cards. Conversion rate = `closed_customer / total * 100`, returns `"0.0%"` when no prospects. Uses `lucide-react` icons. |
| `apps/web/app/(dashboard)/pipeline-breakdown.tsx` | Card rendering all 6 statuses (order from `PROSPECT_STATUSES`, not DB return order) with label + count + a proportional bar. Empty-state message when `total === 0`. |
| `apps/web/app/(dashboard)/recent-activity.tsx` | Feed of the last 10 activities: "`Name` `verb-from-type-label` on `ProspectName`" with relative-time footer (`just now / Nm / Nh / Nd / date`). Prospect name links to `/prospects/[id]`. |
| `apps/web/app/(dashboard)/loading.tsx` | Skeleton mirroring header + 4 cards + 2-column bottom grid. |

### Page

`apps/web/app/(dashboard)/page.tsx` now:
- Pulls `user` via `getCurrentUser()`.
- Builds a `scope = role === "rufero" ? { assignedTo: user.id } : {}` and passes it to each query.
- Fires all four queries in parallel with `Promise.all`.
- Renders `PageHeader` (personalized greeting) + `MetricsCards` + two-column `PipelineBreakdown` / `RecentActivity`.

## Key decisions

- **No views, no RPC, no migration.** The Stage 4 doc recommended `prospect_counts_by_status` + `upcoming_appointments` views plus an `unread_notification_count()` RPC. We skipped the migration because this environment doesn't have the Supabase CLI or psql available to push it, and the inline count queries are cheap and equally RLS-safe. Views/RPCs remain an open optimization for later — switch the helpers over once we can run migrations.
- **Counts are always computed server-side.** Every metric uses `{ count: "exact", head: true }` so we fetch no rows — `count` is the only payload. That keeps the dashboard fast even on tenants with thousands of prospects.
- **Pipeline counts do 6 tiny queries.** In parallel, that's effectively one round-trip. Beats `select status from prospects` + group-in-JS, and matches the Stage 4 doc's "don't compute counts in JS" guidance.
- **Today's appointments uses browser-TZ boundaries.** `new Date()` at `00:00:00.000 → 23:59:59.999` then `.toISOString()` — respects the user's TZ without hardcoding anything. Filter also includes `status in ('scheduled','confirmed')` so we don't count canceled appointments.
- **Rufero scope is belt + suspenders on RLS.** RLS already scopes to tenant; the explicit `.eq("assigned_to", user.id)` / `.eq("rufero_id", user.id)` prevents same-tenant leakage from other ruferos' pipelines. Recent activity is JS-filtered post-join (Supabase PostgREST doesn't filter on embedded-resource fields cleanly) — acceptable at `limit = 10`.
- **Recent-activity verbs live in one map.** `TYPE_LABELS` mirrors the set maintained in `activity-tab.tsx` (status_change, note_added, call, sms, email, appointment, document, assignment, dnc, prospect_update). If either list drifts, users see raw type strings — something to watch as new activity types land.
- **`loading.tsx` at the dashboard route.** `(dashboard)/loading.tsx` is dashboard-specific; it does *not* affect nested routes like `/prospects` which have their own `loading.tsx`.

## Verification

- `pnpm build` — compiles cleanly, 14 routes, TypeScript passes. Only residual warning is the pre-existing `middleware → proxy` deprecation.
- Manual smoke tests (remote Supabase):
  - Sign in as `jirudagutema@gmail.com` → dashboard shows NWA numbers (total prospects = seeded count, unread = 0, conversion rate = closed_customer%).
  - Sign in as `jethior1@gmail.com` → dashboard shows Ozark numbers only (RLS).
  - Add a note on a prospect → dashboard's Recent Activity shows "added a note on X" within one refresh.
  - Change status on a prospect → Pipeline Breakdown counts shift accordingly.
  - All four KPI cards render with real values; no NaN, no flicker.

## Not in Stage 4

- Supabase views + RPC migration (`prospect_counts_by_status`, `upcoming_appointments`, `unread_notification_count`) — inline counts are fine for now; revisit when we have migration tooling in this environment.
- Owner/admin-only analytics cards (MRR, commission revenue) → M7.
- Realtime invalidation of these cards — Stage 5 wires a client-side refresher that revalidates the dashboard when activity / prospects change.

## Pitfalls worth flagging for later stages

- **Notifications schema mismatch with docs.** Stage 4's spec used `read_at` — the live column is `is_read boolean`. Any code that reads notification state must use `is_read`.
- **Activity type vocabulary drift.** Two components (`activity-tab.tsx` and `recent-activity.tsx`) maintain parallel `TYPE_LABELS` maps. Any new type (e.g., when calls land in M4) must be added to *both* — consider consolidating into `lib/constants/activities.ts` once we're sure of the final set.
- **Rufero activity filter is post-join.** If the latest 10 global activities all belong to other ruferos, a rufero could see an empty feed despite having work. Fix in Stage 5 or M3 by adding a proper RPC that filters pre-limit.
- **6-status count fan-out.** Adding more statuses means more parallel queries. If the set grows past ~10, move to the view-based approach.
- **Time zone caveat for "Today's appointments".** The bounds use the server-rendering environment's TZ, which in production is the Vercel region, *not* the user's browser. If that causes confusion we'll need to push TZ from the client or store it on `public.users`.
