# Milestone 2 — Stage 2 Implementation

## Purpose

Ship the Telefonista's daily-driver screen: a filterable, paginated prospects list. First stage that actually reads from the database and writes (via the Notes dialog + `addNote` server action). Everything else — detail tabs, metrics, realtime — follows.

## What was built

### Data layer

| Path | Purpose |
|------|---------|
| `apps/web/lib/auth/current-user.ts` | `getCurrentUser()` wrapped in React `cache()` — dedupes the auth + `public.users` profile fetch across the layout and every page in one request. Redirects to `/login` on missing auth or missing profile. |
| `apps/web/lib/queries/prospects.ts` | `listProspects(filters)` with `{ count: "exact" }`, `.range(from, from + size - 1)`, optional `.eq("city")`, `.eq("status")`, `.ilike("name", ...)`, `.eq("assigned_to", ...)`, and an embedded `assigned_user:users!assigned_to(id, first_name, last_name)` join. `listCities()` returns the tenant's distinct, non-null cities (RLS scopes automatically). |

### Page + UI

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/prospects/page.tsx` | Server component. Parses `searchParams`, validates `status` via `isProspectStatus`, clamps `page` to ≥ 1, and — if the user is a `rufero` — forces `assignedTo = user.id` as defense-in-depth on top of RLS. Fetches list + cities in parallel. |
| `apps/web/app/(dashboard)/prospects/filters.tsx` | Client component. URL-driven filters (city Select, status Select, name search form, Clear, "Query Database" refresh). Uses `useSearchParams` + `router.push` inside `useTransition`. Resets `?page` on any filter change. Uses an `__all__` sentinel because shadcn `Select` doesn't accept empty-string values. |
| `apps/web/app/(dashboard)/prospects/prospect-table.tsx` | Server component wrapping shared `DataTable` with 7 columns: Name (linked), Address (address + city/state), Status (`StatusBadge`), Assigned, Hail (`"` suffix), Home Value (USD), Actions. |
| `apps/web/app/(dashboard)/prospects/prospect-row-actions.tsx` | Client. Six icon buttons per row: Call/SMS/Email/Appt/Go → toast "ships in M4/M5"; Notes → opens `NotesDialog`. Call + SMS disabled when `do_not_call` is true. |
| `apps/web/app/(dashboard)/prospects/notes-dialog.tsx` | Client. Dialog + `Textarea` (added via shadcn) + save button. Calls `addNote` inside `useTransition`, toasts success/error. |
| `apps/web/app/(dashboard)/prospects/pagination.tsx` | Client. Prev/Next link buttons (disabled at boundaries) + "Showing X–Y of N · Page P of T" label. Preserves existing query params when updating `?page`. |
| `apps/web/app/(dashboard)/prospects/realtime-refresh.tsx` | No-op stub. Wired up in Stage 5. |
| `apps/web/app/(dashboard)/prospects/loading.tsx` | Skeleton that mirrors the header + filter row + 10 table rows to minimize layout shift. |
| `apps/web/app/(dashboard)/prospects/actions.ts` | `addNote({ prospectId, body })` server action. Validates with Zod, looks up the caller's `tenant_id` from `public.users`, inserts a `notes` row (tenant_id is NOT NULL on that table — caught it during implementation), then logs an `activities` row with `type = "note_added"` and the note preview in `metadata`. Revalidates `/prospects` and `/prospects/[id]`. |

### Layout + global

- `apps/web/app/(dashboard)/layout.tsx` — now uses `getCurrentUser()` directly; removes the duplicated profile fetch from Stage 1.
- `apps/web/app/layout.tsx` — mounts `<Toaster richColors position="top-right" />` from `components/ui/sonner` so server actions / row buttons can surface feedback.
- `components/ui/textarea.tsx` — added via `pnpm dlx shadcn@latest add textarea`.

## Key decisions

- **`getCurrentUser()` is React-cached, not module-cached.** `cache()` scopes dedup to a single request, so the layout and every page share one auth + profile roundtrip, and there's no cross-request leakage.
- **Role filter is belt + suspenders.** The page injects `assignedTo = user.id` for ruferos; RLS still enforces the tenant boundary and would block cross-tenant access even if a bug let the filter through.
- **`Select` uses an `__all__` sentinel** because Radix/shadcn `Select.Item` disallows `value=""`. Clearing a filter means swapping the sentinel back to "unset" when pushing URL params.
- **Pagination is URL-based, not stateful.** Prev/Next render real `<Link>`s. Means back-button works, page is shareable, and the server component refetches cleanly.
- **`addNote` looks up tenant_id server-side** rather than trusting any client-supplied value. `notes.tenant_id` is NOT NULL and we never want to accept it from the client.
- **Notes write also logs an activity row.** This keeps the activities feed (Stage 3 detail view) accurate from day one instead of backfilling later.
- **Action buttons that aren't in scope just toast.** Keeps the row UI honest for users — they see where the feature *will* live without the button silently doing nothing.

## Verification

- `pnpm build` — compiles cleanly, 14 routes generated, TypeScript passes. Only warning is the pre-existing `middleware → proxy` deprecation notice (tracked for later).
- Manual smoke tests to run on the remote Supabase project (seed tenants already provisioned):
  - Sign in as `jirudagutema@gmail.com` / `Demo1234!` (NWA Roofing Co owner) → `/prospects` shows seeded NWA prospects; filters reduce the list; search works on `name` (case-insensitive).
  - Sign in as `jethior1@gmail.com` / `Demo1234!` (Ozark Roofing Co owner) → sees only Ozark prospects (RLS).
  - Click a row → routes to `/prospects/[id]` placeholder (detail lands in Stage 3).
  - Open Notes dialog on a row → save → toast success, activities row written.
  - Prev/Next pagination updates `?page=` in the URL and is disabled at boundaries.

## Not in Stage 2

- Prospect detail page (tabs, notes feed, activity timeline) → Stage 3
- Dashboard KPIs + RPC-backed metrics → Stage 4
- Realtime subscription → Stage 5 (the stub is in place)
- Real Call / SMS / Email / Appt / Go actions → M4 / M5

## Pitfalls worth flagging for later stages

- **`notes.tenant_id` is NOT NULL.** Any future writer must look up the caller's tenant_id server-side — don't trust the client, and don't leave it unset.
- **Activity `type` values are enforced app-side, not by a DB CHECK.** We used `"note_added"`; keep the vocabulary consistent across stages (`status_change`, `call`, `sms`, `email`, `appointment`, `document`, `assignment`, `dnc`, `note_added`).
- **`Select` sentinel pattern.** If/when we add more filter dropdowns that can be cleared, reuse the `__all__` sentinel rather than trying `value=""` — it will throw at runtime.
- **React `cache()` only dedupes per-request.** If we ever introduce a global profile cache, it needs explicit invalidation on role changes.
