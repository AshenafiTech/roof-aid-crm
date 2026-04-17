# Lead Status Tabs

## Purpose

Extend the leads navigation from the existing `New Leads` and `Prospects` tabs to cover every pipeline status, plus a new `All Leads` tab that aggregates everything with an on-page status filter.

This matches the six canonical pipeline statuses from the SRS (`new_leads`, `prospects`, `contacted`, `scheduled`, `closed_customer`, `not_viable`) and gives users a direct entry point into each stage.

## Changes

### New routes

All new pages live under `apps/web/app/(dashboard)/` and reuse the shared `ProspectListView` (no new UI primitives were introduced):

| Route | Status filter | Status dropdown visible? |
| --- | --- | --- |
| `/all-leads` | driven by URL `?status=` (validated via `isProspectStatus`) | yes |
| `/contacted` | fixed `contacted` | no |
| `/scheduled` | fixed `scheduled` | no |
| `/closed-customers` | fixed `closed_customer` | no |
| `/not-viable` | fixed `not_viable` | no |

Each page mirrors the existing `/new-leads/page.tsx` pattern: reads `searchParams`, resolves the current user, composes `ProspectFilters`, fetches rows/cities/states in parallel, applies anti-collision rotation, and renders `ProspectListView`.

### Row actions

Per request, the new tabs do **not** render inline row action buttons. Inline `InlineRowActions` in `prospect-list-view.tsx` is already gated by `basePath === "/prospects"` (line 519), so the new basePaths (`/all-leads`, `/contacted`, `/scheduled`, `/closed-customers`, `/not-viable`) fall back to the row-click behavior and the existing `BulkActionsMenu`, matching `/new-leads`.

### All Leads status filter

`ProspectListView` already supports `showStatusFilter`. Passing `showStatusFilter={true}` on `/all-leads` surfaces the existing status dropdown in the filter bar, and `statusFilter={statusParam}` drives the "X of Y <status>" counter text. The dropdown writes to the `status` URL param, which the server page re-reads on the next request.

### Sidebar navigation

`apps/web/app/(dashboard)/nav-items.ts` was extended with six entries in the `main` section, ordered to reflect the pipeline flow:

1. Dashboard
2. All Leads (new) — `Layers`
3. New Leads — `Sparkles`
4. Prospects — `Users`
5. Contacted (new) — `PhoneCall`
6. Scheduled (new) — `CalendarCheck`
7. Closed Customers (new) — `CheckCircle2`
8. Not Viable (new) — `Ban`
9. Appointments / Documents / Notifications (unchanged)

All entries are visible to `owner`, `admin`, `telefonista`, and `rufero`. RLS and the `assignedTo` filter inside each page already enforce the rufero-only visibility rule.

## Files touched

- Added: `apps/web/app/(dashboard)/all-leads/page.tsx`
- Added: `apps/web/app/(dashboard)/contacted/page.tsx`
- Added: `apps/web/app/(dashboard)/scheduled/page.tsx`
- Added: `apps/web/app/(dashboard)/closed-customers/page.tsx`
- Added: `apps/web/app/(dashboard)/not-viable/page.tsx`
- Edited: `apps/web/app/(dashboard)/nav-items.ts` (added 5 sidebar entries + icon imports)

## Decisions & notes

- **No new query code.** `listProspects` already accepts any `ProspectStatus` via `ProspectFilters.status`; the new pages are thin server wrappers.
- **No bespoke row actions per status.** The user explicitly asked to drop the inline actions on the new tabs; bulk actions and the per-row detail panel remain available.
- **`/all-leads` status param is validated** with `isProspectStatus` before being passed to the query, so an arbitrary `?status=foo` is ignored rather than forwarded to the database.
- **Not reshuffling `/prospects`.** The existing `/prospects` route keeps its inline actions and `showStatusFilter={false}` — no regression to that page.
