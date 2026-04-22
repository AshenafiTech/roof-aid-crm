# Milestone 2 — Stage 3 Implementation

## Purpose

Deliver the single-prospect view — the screen Telefonistas and Ruferos open dozens of times a day. Five tabs (Overview, Pipeline, Assignment, Activity, Notes), inline edit on Overview, role-gated status workflow, role-gated reassignment, and a full audit log. All data reads from the database. No placeholder tabs in M2 scope.

## What was built

### Permissions helper

| Path | Purpose |
|------|---------|
| `apps/web/lib/auth/permissions.ts` | `canAssignProspects(role)`, `canEditProspect(role)`, and `canTransition(role, from, to)` — the server-side source of truth for status workflow. Rufero can only move `scheduled → closed_customer / not_viable`; Telefonista can do anything except transitions *from* `not_viable`; Owner/Admin/Super-admin unrestricted. |

### Detail page + shell

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/prospects/[id]/page.tsx` | Server component. Parallel-loads prospect (+ assignee), last 100 activities (+ user), notes (+ author), and active ruferos. Calls `notFound()` on missing prospect. Also 404s when a Rufero opens someone else's prospect — RLS still blocks cross-tenant data, this check blocks cross-assignment access inside a tenant. |
| `apps/web/app/(dashboard)/prospects/[id]/types.ts` | Shared row types (`ProspectWithAssignee`, `ActivityWithUser`, `NoteWithAuthor`, `UserLite`) + `displayName()` helper so every tab formats people identically. |
| `apps/web/app/(dashboard)/prospects/[id]/tabs.tsx` | Client component wrapping shadcn `Tabs`. Reads / writes `?tab=` via `router.replace(..., { scroll: false })` so the URL carries tab state without jumping the viewport. Unknown values fall back to `overview`. |
| `apps/web/app/(dashboard)/prospects/[id]/loading.tsx` | Skeleton mirroring header + tabs + card grid. |
| `apps/web/app/(dashboard)/prospects/[id]/not-found.tsx` | "Prospect not found or no access" + back link. |
| `apps/web/app/(dashboard)/prospects/[id]/error.tsx` | Client error boundary with retry. |

### Tabs

| Path | Purpose |
|------|---------|
| `overview-tab.tsx` | Read-mode card grid of name, phone, email, address, city/state, ZIP, hail, home value, source, DNC. Edit toggle reveals a form for the 5 M2-scoped fields (name, phone, email, hail_size, home_value). Numeric inputs validated client-side; server re-parses with Zod. Hidden from roles without `canEditProspect`. |
| `pipeline-tab.tsx` | Current status + a `Select` for transition. Items the caller's role can't reach are disabled inline. Below: a timeline rendered from `activities` where `type = "status_change"` (from-badge → to-badge + who/when). |
| `assignment-tab.tsx` | Current assignee + (for owner/admin only) a `Select` listing active ruferos, with an "Unassigned" sentinel. Below: reassignment history from `activities` where `type = "assignment"`. |
| `activity-tab.tsx` | Full audit log in `DataTable` form — timestamp, type (human-labeled), user, one-line detail summarized from `metadata`. Limited to the latest 100 rows fetched in the page component; no pagination in M2. |
| `notes-tab.tsx` | Reuses the existing `addNote` server action from Stage 2. Textarea + Save; below, the notes feed (author + timestamp + body), newest first. M2 doesn't support edit or delete. |

### Server actions

`apps/web/app/(dashboard)/prospects/[id]/actions.ts`:

- `updateProspect` — Zod-validated patch; reads current values first so we can log a `prospect_update` activity with `{ before, after }` in `metadata`. Phone input is normalized into the `prospects.phones: string[]` column (single-entry array).
- `changeStatus` — fetches current status fresh (never trusts the client), re-checks `canTransition` with the role from `public.users`, updates, logs `type = "status_change"` with `{ from, to }`.
- `assignProspect` — `canAssignProspects` guard, writes `assigned_to`/`assigned_by`/`assigned_at`, logs `type = "assignment"` with `{ from, to }` (user IDs).

Every action calls `revalidatePath` for both `/prospects/[id]` and `/prospects` so list rows reflect new assignees/statuses immediately.

## Key decisions

- **Permissions live in one module.** Both the server actions (truth) and the tab UIs (hint) call `canTransition` / `canAssignProspects`. Client calls are UX polish; the server call is the gate.
- **Current state is always refetched server-side before mutating.** `changeStatus` re-reads `prospects.status` and `assignProspect` re-reads `prospects.assigned_to` — the client's copy is never authoritative.
- **Activity `metadata` replaces the doc's `changes` field.** The Stage 3 doc was drafted against an earlier schema — the live `activities` table uses `type` + `metadata` (JSONB). All writes use that. New activity types introduced this stage: `prospect_update`, `assignment` (both already permitted since there's no DB check constraint).
- **`notes.tenant_id` continues to be server-derived** from the caller's profile. Client never supplies it.
- **Rufero gate is both RLS + app check.** RLS stops cross-tenant reads; the app check (`prospect.assigned_to !== user.id → notFound()`) stops intra-tenant leaks of other ruferos' prospects.
- **Overview edit form is intentionally small.** Only the 5 fields that make sense to edit without geocoding / DNC / assignment UI. Address edits will come in M3 when we wire geocoding.
- **Phone is stored as `phones: [value]`.** Schema is `text[]`; the form takes one input. Future UI can expose multi-phone without a migration.
- **`Tabs` uses `router.replace(..., { scroll: false })`** so clicking a tab never scrolls the page back to the top — important on long prospect records.

## Verification

- `pnpm build` passes cleanly; 14 routes, TypeScript happy. Only warning remains the unrelated `middleware → proxy` deprecation.
- Manual smoke tests (remote Supabase):
  - Sign in as NWA owner (`jirudagutema@gmail.com`) → open any prospect → all five tabs render.
  - Edit Overview → save → toast success, returns to read mode, fields reflect new values, Activity tab shows a `Prospect updated` row.
  - Pipeline tab → change status → disallowed transitions are disabled in the dropdown; allowed ones log and revalidate.
  - Assignment tab → reassign to a rufero → history row added; list page (`/prospects`) reflects new assignee.
  - Notes tab → add note → appears at top of list + in Activity tab.
  - As an Ozark user (`jethior1@gmail.com`), opening an NWA prospect URL → 404 (RLS blocks the read, `maybeSingle()` returns null, `notFound()` renders).

## Not in Stage 3

- Call / SMS / Email / Appointment / Document tabs → M3 / M4 / M5
- Inspection + Map tabs → M5
- Full edit form with address geocoding → M3
- Notes edit / delete → out of M2 scope
- Activity pagination → defer until we see a tenant break the 100-row ceiling

## Pitfalls worth flagging for later stages

- **Activity `type` vocabulary is growing.** Current set used in code: `status_change`, `note_added`, `assignment`, `prospect_update`. Any new writer must use an existing type or deliberately extend the list (and update `activity-tab.tsx` `TYPE_LABELS`). There's no DB check constraint to catch typos.
- **`maybeSingle()` is load-bearing for the 404 path.** Don't switch to `.single()` on the prospect fetch — it throws on "no rows", which would trip the `error.tsx` boundary instead of rendering `not-found.tsx`.
- **Tabs read URL state.** Server-side rendering can't know the active tab; if we ever need SSR-specific per-tab queries we'll need to read `searchParams.tab` in the page and pass it down.
- **`Select` disabled-item UX is Radix-native** — disabled items are still keyboard-focusable but can't be selected. If product wants them fully hidden, swap to filtered items instead of `disabled`.
