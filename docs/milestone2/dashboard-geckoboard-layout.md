# Dashboard — Geckoboard-style Command Center

## Purpose

Replace the previous metrics/pipeline/activity dashboard with a Salesforce/Geckoboard-style command center that matches the layout in the client's reference screenshot and implements the metrics defined in `docs/milestone2/dashboard(1).docx`.

## Source documents

- Reference image: client's Salesforce/Geckoboard screenshot.
- Spec: `docs/milestone2/dashboard(1).docx` — Sections 1–9, 50+ metrics.

## Layout

Two rows, each a responsive grid.

**Top row (`grid-cols-12` on `lg`):**
- `col-span-3` — Revenue hero (big "Closed this quarter" number + progress-vs-target bar) stacked over Closed/Won card (MTD + Today).
- `col-span-3` — Pipeline funnel (5 stages: new_leads → prospects → contacted → scheduled → closed_customer).
- `col-span-6` — Cumulative sales this month (SVG-free bar chart, one bar per day, highlights today in green).

**Bottom row (`xl:grid-cols-4`, `md:grid-cols-2`):**
- Recent deals — latest 8 closed prospects, value column.
- Deals leaderboard — top 6 reps by closed value this month.
- Lead close rate — semicircular gauge with risk alert card (stale leads 7d+).
- SDR activity — per-rep calls (today) + meetings booked (7d) paired bar chart.

## Data model decisions

The spec mentions `claimValue` on prospects, `closedAt`, and a tenant monthly revenue target. None of these exist in the current schema, so:

| Spec field | Substitute used |
|---|---|
| `prospects.claimValue` | `prospects.home_value` |
| `prospects.closedAt` | `prospects.updated_at` when `status = 'closed_customer'` (imperfect but serviceable for demo) |
| tenant monthly revenue target | Hard-coded `DEFAULT_MONTHLY_TARGET = 500_000` with TODO to read from `tenants.settings.monthly_revenue_target` |

Follow-up: add `closed_at timestamptz` to `prospects` (set by trigger on status→closed_customer) and `settings.monthly_revenue_target` on `tenants` so these substitutes can be replaced.

## Role scoping

- **Owner / Admin / Telefonista** — see full-tenant numbers.
- **Rufero** — the page passes `{ assignedTo: user.id }` to every query; only their assigned prospects and appointments drive the visuals.

## Empty-state handling for future data sources

Panels that depend on tables which are empty in the current seed are marked with a small italic note instead of a fake number. In particular:
- **SDR activity** — shows a "Call data will populate after Telnyx integration (M4)" caption when `call_logs` has no rows today.

No panels on the main dashboard depend on `sms_logs`, `documents`, `supplements`, or `commission_transactions` (all M4+ surfaces). Those metrics are intentionally deferred; they will plug into a future Analytics page when their source tables are populated.

## Files created

- `apps/web/lib/queries/dashboard-metrics.ts` — `getRevenueBuckets`, `getCumulativeSalesThisMonth`, `getRecentDeals`, `getDealsLeaderboard`, `getCloseRate`, `getRiskCounts`.
- `apps/web/app/(dashboard)/revenue-hero.tsx` — `RevenueHero` + `ClosedWonCard`.
- `apps/web/app/(dashboard)/pipeline-funnel.tsx`
- `apps/web/app/(dashboard)/cumulative-sales-chart.tsx`
- `apps/web/app/(dashboard)/recent-deals.tsx`
- `apps/web/app/(dashboard)/deals-leaderboard.tsx`
- `apps/web/app/(dashboard)/close-rate-gauge.tsx` — inline semicircle SVG gauge + stale-lead risk card.
- `apps/web/app/(dashboard)/sdr-activity-chart.tsx`

## Files modified

- `apps/web/app/(dashboard)/page.tsx` — new 12-column + 4-column layout, fetches the six metrics in parallel, retains `DashboardRealtime` for live refresh on prospects/activities/notifications.
- `apps/web/app/(dashboard)/loading.tsx` — skeleton redesigned to mirror the new layout.

## Files left in place (not yet removed)

The previous dashboard components (`metrics-cards.tsx`, `pipeline-breakdown.tsx`, `upcoming-appointments.tsx`, `recent-activity.tsx`, `prospect-workspace.tsx`, `pipeline-status-cards.tsx`, `prospect-list-card.tsx`) are still present. They are reused elsewhere (e.g. Analytics page imports the same underlying queries) or will be repurposed later; removing them is out of scope for this change.

## Verification

- `npx tsc --noEmit` — clean.
- Visual verification to be done by logging in as `owner@demo.com` and confirming the layout and data match expectations. Rufero role should see scoped numbers.

## Known limitations / follow-ups

1. Close-date approximation via `updated_at` will drift if closed prospects are edited later. Add `closed_at` column + trigger.
2. Monthly target is hard-coded; move to tenant settings.
3. SMS/Documents/Supplements metrics from the spec are not yet shown — they become meaningful only after M4/M5 integration populates their tables.
4. Gauge color bands (red/amber/green) are visual only; no thresholds are enforced anywhere.
