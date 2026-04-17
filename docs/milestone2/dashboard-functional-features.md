# Dashboard Functional Features — M2 Completion

## Purpose
Make the dashboard and key pages functional. The dashboard serves as a command center — quick overview of pipeline health, upcoming appointments, and recent activity. Prospect listing is handled by the dedicated `/new-leads` and `/prospects` pages (which have full filtering, map/list toggle, etc.). Analytics was a stub. Appointments was a stub.

## Changes

### 1. Dashboard — Command Center
**Before:** Dashboard showed only metrics cards, pipeline breakdown, and recent activity.

**After:** Dashboard is now a full command center:
- **Greeting header** with quick-nav buttons to New Leads and Prospects pages
- **4 metric cards** — Total Prospects, Today's Appointments, Unread Notifications, Conversion Rate
- **Pipeline breakdown** — horizontal bar chart with per-status colors and counts
- **Upcoming appointments** — next 5 appointments with prospect name (linked), rufero, city, time, status badge, and "View all" link to `/appointments`
- **Recent activity** — last 10 actions across the team with prospect links and relative timestamps
- **Role scoping** — ruferos see only their assigned data
- **Real-time** — subscriptions on prospects, activities, and notifications tables

**Files modified:**
- `apps/web/app/(dashboard)/page.tsx` — Fetches pipeline, appointments, activity, renders command center
- `apps/web/app/(dashboard)/loading.tsx` — Skeleton matching new layout

**Files created:**
- `apps/web/app/(dashboard)/upcoming-appointments.tsx` — Upcoming appointments card with prospect links

### 2. Analytics Page (Real Data)
**Before:** Stub page saying "Coming in Milestone 7."

**After:** Full analytics dashboard with:
- **Metrics cards** — Total prospects, today's appointments, unread notifications, conversion rate
- **Pipeline breakdown** — Status bar chart with per-status colors
- **Conversion funnel** — Contact rate, schedule rate, close rate with funnel visualization bars
- **Team performance** — Table of active team members with assigned/closed/activity counts (last 30 days)
- **Recent activity** — Last 15 activity items with prospect links
- **Access control** — Only owner, admin, super_admin can access

**Files created:**
- `apps/web/lib/queries/analytics.ts` — `getTeamPerformance()`, `getConversionMetrics()`
- `apps/web/app/(dashboard)/admin/analytics/team-performance.tsx` — Team table component
- `apps/web/app/(dashboard)/admin/analytics/conversion-funnel.tsx` — Funnel visualization

**Files modified:**
- `apps/web/app/(dashboard)/admin/analytics/page.tsx` — Replaced stub with real data

### 3. Appointments Page (Real Data)
**Before:** Stub page saying "Coming in Milestone 5."

**After:** Functional appointments list:
- **Stats cards** — Today, upcoming, pending, completed counts
- **Filters** — Time range (upcoming/today/past/all) + status dropdown
- **Appointment cards** — Prospect name (linked), date/time, assigned rufero, duration, status badge, notes
- **Pagination** — Page-based with Previous/Next
- **Empty state** — Informative card when no appointments match filters
- **Role scoping** — Ruferos see only their assigned appointments

**Files created:**
- `apps/web/lib/queries/appointments.ts` — `listAppointments()`, `getAppointmentStats()`
- `apps/web/app/(dashboard)/appointments/appointment-stats.tsx` — Stats cards
- `apps/web/app/(dashboard)/appointments/appointment-filters.tsx` — Filter dropdowns
- `apps/web/app/(dashboard)/appointments/appointment-table.tsx` — Appointment list with pagination

**Files modified:**
- `apps/web/app/(dashboard)/appointments/page.tsx` — Replaced stub with real page

## Architecture Notes

### Dashboard Layout
The dashboard shell's `<main>` element now uses `flex flex-col gap-4` instead of just padding, allowing the prospect workspace to fill available height via `flex-1`. Other pages are unaffected since they wrap content in their own `<div>`.

### Query Strategy
- **Analytics**: Uses parallel `Promise.all` for all metrics. Team performance aggregates across 3 queries (assigned prospects, closed prospects, recent activities).
- **Appointments**: Uses Supabase joins to fetch prospect + rufero + creator in a single query. Stats use `{ count: "exact", head: true }` for efficiency.

### Existing Components Reused
- `MetricsCards` — used on analytics page
- `PipelineBreakdown` — used on analytics page
- `RecentActivity` — used on analytics page
- `PipelineStatusCards` — used on dashboard
- `ProspectWorkspace` + `ProspectListCard` — used on dashboard (were previously created but unwired)
