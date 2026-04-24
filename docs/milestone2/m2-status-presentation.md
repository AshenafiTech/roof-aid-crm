---
Milestone 2 — Status Presentation
Date: 2026-04-17
Branch reviewed: feat(milestone-2-next)
---

# Milestone 2 — Where We Are

## 1. TL;DR
M2 shipped the full prospect pipeline the client demo-script asks for, plus the gap fixes called out in [milestone-2-analysis.md](milestone-2-analysis.md) and several beyond-scope wins (user management, Excel import, dark mode, Leaflet map). The only material gap left is the **Flutter mobile assigned-prospects list (Stage 6)**, which is correctly deferred to M3b.

## 2. What's done — checklist

### Core stages (blueprint M2)
- [x] **Stage 1** — shadcn primitives, shared UI (`PageHeader`, `StatusBadge`, `DataTable`, `ProspectCard`), role-aware collapsible sidebar + mobile sheet → [stage-1-implementation.md](stage-1-implementation.md)
- [x] **Stage 2** — `/prospects` list with URL-driven city/status/search filters, pagination, 6 row actions, Notes dialog + `addNote` server action → [stage-2-implementation.md](stage-2-implementation.md)
- [x] **Stage 3** — prospect detail with 5 tabs (Overview, Pipeline, Assignment, Activity, Notes), role-gated transitions via `canTransition`, full audit log → [stage-3-implementation.md](stage-3-implementation.md)
- [x] **Stage 4** — dashboard KPIs, pipeline breakdown, recent-activity feed, rufero scoping → [stage-4-implementation.md](stage-4-implementation.md)
- [x] **Stage 5** — Supabase Realtime on prospects/activities/notes/notifications + notification bell; publication migration `007_enable_realtime.sql` ready → [stage-5-implementation.md](stage-5-implementation.md)
- [ ] **Stage 6** — Flutter assigned-prospects list + realtime sync (scaffolding only; deferred to M3b per analysis §4.3)

### Gap fixes from the analysis
- [x] Activities RLS (INSERT policy + telefonista SELECT) — migration `008_fix_activities_rls.sql`
- [x] Dashboard layout — pipeline status cards + prospect workspace (list + map region) replacing the metrics-only screen
- [x] Anti-Collision rotation (`applyAntiCollisionRotation`) on Dashboard and `/prospects`
- [x] "Load 60 More" additive pagination with "X de Y" count
- [x] DNC toggle on prospect detail (reason + timestamp + `dnc` activity log), plus `tipo` surfaced on Overview

### Beyond-scope wins that landed on this branch
- [x] **User management** (`/admin/users`) — invite/edit/deactivate/reset-password/delete via Supabase admin client, owner-gated
- [x] **Excel/CSV prospect import** — SheetJS parser, fuzzy column mapping, batched inserts, DNC handling, entry points on Dashboard + New Leads
- [x] **Dark mode** — Telegram-inspired palette via `next-themes`, toggle in desktop + mobile sidebar
- [x] **Leaflet map view** — status-colored SVG pins, bi-directional list↔pin selection, scroll-into-view, no API key required
- [x] **Status-sliced pages** — `/new-leads`, `/contacted`, `/scheduled`, `/closed-customers`, `/not-viable`, `/all-leads`
- [x] **Analytics page** — team performance table, conversion funnel, pipeline breakdown (owner/admin only)
- [x] **Appointments page** — stats, filters, pagination, rufero scoping

## 3. Demo script status (README §9)
1. [x] Login → dashboard with real counts
2. [x] Prospects list with pagination
3. [x] City + status filter → query
4. [x] Prospect detail with all M2 tabs
5. [x] Status change logged in Activity tab
6. [x] Studio edit → list updates live (requires migration 007 applied)
7. [x] Rufero sees only assigned prospects
8. [ ] Flutter app shows same assigned prospects — **blocked on Stage 6**

## 4. Known follow-ups before/with M3
- Apply `007_enable_realtime.sql` in Supabase Studio (subscriptions are silent until then).
- Apply `008_fix_activities_rls.sql` (merge blocker per analysis §2.7).
- Consolidate `TYPE_LABELS` (duplicated in `activity-tab.tsx` and `recent-activity.tsx`) before more activity types land in M4.
- Replace 6× count-head fan-out with the deferred `prospect_counts_by_status` view once migration tooling is available.
- Finish Stage 6 (mobile list + realtime) as part of M3b.

## 5. Verdict
Demo-ready for everything except the Flutter step. The branch is a clean M2 + M2.5 fold-in: the core pipeline, the corrected dashboard layout, and the business-critical Anti-Collision rotation are all in one place.
