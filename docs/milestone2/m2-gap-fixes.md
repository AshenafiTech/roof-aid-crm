# Milestone 2 — Gap Fixes from Analysis

## Purpose
Implement the critical fixes identified in `milestone-2-analysis.md` that were blocking M2 completion.

## Changes Implemented

### 1. Activities RLS Fix (BLOCKER — Fixed)
**Problem:** No INSERT policy existed for the activities table, so all server actions that log activities (status changes, notes, assignments, updates) would fail with RLS violations. The SELECT policy only allowed owner/admin, locking out telefonista users.

**Fix:** New migration `008_fix_activities_rls.sql`:
- Dropped the broken `activities_select` policy
- Recreated SELECT: owner/admin/super_admin see all tenant activities, telefonista sees only their own (`user_id = auth.uid()`)
- Added INSERT policy: all authenticated users within the tenant can insert activities

**Files:**
- `supabase/migrations/008_fix_activities_rls.sql`

### 2. Dashboard Layout Redesign
**Problem:** Dashboard showed metrics cards + pipeline breakdown, but spec Section 7.2 requires a prospect workspace with list + map.

**Fix:** Redesigned dashboard to match spec:
- **PipelineStatusCards:** Colored summary cards across the top showing counts per status (Total, New Leads, Prospects, Contacted, Scheduled, Closed, Not Viable, Today's Appts)
- **ProspectWorkspace:** Split panel — prospect list on the left (2/3 width), map placeholder + recent activity on the right (1/3 width)
- Filters (city, status, search) inline above the list
- Prospect cards with left accent border, status badge, location, phone, DNC indicator

**Files:**
- `apps/web/app/(dashboard)/page.tsx` — Redesigned
- `apps/web/app/(dashboard)/pipeline-status-cards.tsx` — New
- `apps/web/app/(dashboard)/prospect-workspace.tsx` — New
- `apps/web/app/(dashboard)/prospect-list-card.tsx` — New

### 3. Anti-Collision Rotation
**Problem:** Spec Section 30 requires display order rotation so multiple Telefonistas don't call the same prospect simultaneously. Standard `ORDER BY created_at DESC` gives everyone the same list.

**Fix:** Added `applyAntiCollisionRotation()` in `lib/queries/prospects.ts`. Rotates the result array by `new Date().getSeconds() % length`, so each page load within the same minute shows a different starting position. Applied on both Dashboard and Prospects page.

**Files:**
- `apps/web/lib/queries/prospects.ts` — Added `applyAntiCollisionRotation()`
- `apps/web/app/(dashboard)/page.tsx` — Uses rotation
- `apps/web/app/(dashboard)/prospects/page.tsx` — Uses rotation

### 4. "Load 60 More" Pagination
**Problem:** Spec Section 7.2 requires additive "Load 60 More" with "X de Y" format, not standard page-based prev/next.

**Fix:** Replaced page-based pagination with additive loading:
- Query now uses `offset` + `pageSize` instead of `page`
- `LoadMore` component replaces `Pagination` — shows "X de Y" and a "Load 60 More" button
- "Load More" increases the `load` search param, server fetches all rows up to that point
- Applied on both Dashboard and Prospects page

**Files:**
- `apps/web/lib/queries/prospects.ts` — Changed to offset-based
- `apps/web/app/(dashboard)/prospects/page.tsx` — Uses LoadMore
- `apps/web/app/(dashboard)/prospects/load-more.tsx` — New component

### 5. DNC Toggle on Prospect Detail
**Problem:** Missing UI to toggle `do_not_call` flag per spec Section 7.5. Schema had `do_not_call_reason` and `do_not_call_at` fields but no UI exposed them.

**Fix:**
- Added `toggleDoNotCall` server action with reason field and timestamp
- Created `DncToggle` component showing current DNC status, reason input, and toggle button
- Added to Overview tab (below prospect details)
- Logs `dnc` activity type for audit trail
- Also exposed `tipo` field in the overview display

**Files:**
- `apps/web/app/(dashboard)/prospects/[id]/actions.ts` — Added `toggleDoNotCall`
- `apps/web/app/(dashboard)/prospects/[id]/dnc-toggle.tsx` — New component
- `apps/web/app/(dashboard)/prospects/[id]/overview-tab.tsx` — Added DncToggle + tipo field

## Remaining Items (Correctly Deferred)
- Google Maps integration → M3
- Mobile assigned-prospects list (Flutter) → M3
- Missing 7 of 12 profile tabs → M3-M6
- PWA support → M3
- Onboarding checklist → M3
