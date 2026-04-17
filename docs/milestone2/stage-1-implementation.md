# Milestone 2 — Stage 1 Implementation

## Purpose

Deliver the UI foundation that every M2 feature page builds on: shadcn primitives, shared components (`PageHeader`, `StatusBadge`, `DataTable`, `ProspectCard`), a role-aware collapsible sidebar, and a mobile sheet navigation. After Stage 1 the dashboard shell is ready to host Stages 2–5 without per-page layout work.

## What was built

### Dependencies (shadcn/ui)

Added via `pnpm dlx shadcn@latest add …`:

```
table, dialog, select, tabs, badge, dropdown-menu, sheet, avatar,
separator, skeleton, sonner
```

Landed in `apps/web/components/ui/`. The shadcn CLI also pulled in `next-themes` and `sonner` transitively.

### New files

| Path | Purpose |
|------|---------|
| `apps/web/lib/constants/prospect-status.ts` | Canonical list of the 6 prospect statuses + display labels + Tailwind color classes + `isProspectStatus` guard |
| `apps/web/components/shared/page-header.tsx` | Title + optional description + right-side action slot; used on every dashboard page |
| `apps/web/components/shared/status-badge.tsx` | Reads from the constants map; gracefully renders an "Unknown" pill when the DB value falls outside the enum |
| `apps/web/components/shared/data-table.tsx` | Thin, dumb wrapper over shadcn `Table` — takes columns, rows, empty, footer slots; no TanStack Table yet |
| `apps/web/components/shared/prospect-card.tsx` | List-view card: name (linked), address, StatusBadge, assigned / hail / home value, optional actions slot |
| `apps/web/app/(dashboard)/nav-items.ts` | Typed nav config + `filterNavForRole` + `isRouteActive` helpers |
| `apps/web/app/(dashboard)/sidebar-nav.tsx` | Client component — renders Main / Admin sections, highlights active route via `usePathname` |

### Modified files

- `apps/web/app/(dashboard)/dashboard-shell.tsx` — replaced the top-bar-only shell with a two-column layout: sticky desktop sidebar (collapsible to icon rail), mobile hamburger opening the `Sheet`, top bar keeps role label + user name + sign out.
- Dashboard home (`(dashboard)/page.tsx`) and every placeholder route (`appointments`, `documents`, `communications`, `admin/users`, `admin/analytics`, `admin/settings`, `prospects`, `prospects/[id]`) now render a `PageHeader` with a forward-looking description of when the feature arrives.

## Key decisions

- **Prospect status enum lives app-side.** The `prospects.status` column in Postgres is unconstrained `text DEFAULT 'new_leads'`. Rather than introduce a CHECK constraint mid-milestone, the enum is asserted in TypeScript via `PROSPECT_STATUSES as const` and the `isProspectStatus` guard. `StatusBadge` degrades gracefully when the DB returns an unexpected value. We can harden to a DB CHECK in a later migration if needed.
- **Sidebar role filtering is presentational only.** The backstop is still RLS + per-route auth checks. Hiding a link is not security — Stages 2 and 3 will enforce role gates in the server components and server actions.
- **Active route match uses `startsWith` (with a special case for `/`).** Nested routes like `/prospects/abc` still highlight the `Prospects` item.
- **Mobile navigation is a `Sheet` component.** The hamburger appears only below the `md` breakpoint; clicking a link calls the shell-supplied `onNavigate` to auto-close.
- **`DataTable` stays deliberately minimal.** No sorting / column management / TanStack Table until we see concrete need in M3+. Columns are plain objects with a `cell` render fn.

## Verification

- `pnpm build` — compiles cleanly, TypeScript passes, all 14 routes generated (login, onboarding, super-admin, dashboard home, prospects list / detail, appointments, documents, communications, admin/{users,analytics,settings}, not-found).
- Sign in as either seeded owner (`jirudagutema@gmail.com` / `jethior1@gmail.com`, password `Demo1234!`) and verify the sidebar renders all Main + Admin items. Sign in as a non-owner role later (after Stage 2 seeds more users) to see filtered nav.

## Not in Stage 1

- Real prospect list, filters, pagination → Stage 2
- Prospect detail tabs → Stage 3
- Dashboard metrics (views + RPC) → Stage 4
- Realtime subscriptions → Stage 5

## Pitfalls worth flagging for later stages

- The Next.js build warned that the `middleware` file convention is deprecated in favor of `proxy`. Not blocking for M2 — track as a follow-up.
- `lucide-react` is pinned to `^1.7.0` in `package.json`; the shadcn-generated components import icons assuming the modern API — verify each new component still resolves its icons during Stage 2.
