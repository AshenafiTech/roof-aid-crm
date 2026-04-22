# Milestone 2 — Prospect Pipeline + Dashboard

**Duration:** Weeks 2–3
**Goal:** Build the core CRM feature — the prospect pipeline that Telefonistas use all day. This is the product's primary revenue-generating surface.

---

## 1. Why this milestone matters

Milestone 1 gave us a secure multi-tenant foundation (auth, RLS, tables, storage). But the product has **zero user value** until a Telefonista can:

1. Log in and see a dashboard with real numbers
2. Filter a list of prospects by city + status
3. Click into a prospect and view their full profile
4. See prospect changes update live (real-time)
5. See their assigned prospects on mobile

Milestone 2 delivers exactly that — the **first demo-able product increment** the client can show to a real roofing company.

---

## 2. Scope summary (from blueprint M2)

| # | Task | Surface |
|---|------|---------|
| M2-1 | Sidebar navigation (role-based) | Web |
| M2-2 | Prospects list page with filters + pagination | Web |
| M2-3 | Prospect detail page with tabs | Web |
| M2-4 | Dashboard home with real metrics | Web |
| M2-5 | Real-time updates on prospects + notifications | Web |
| M2-6 | Install required shadcn/ui components | Web |
| M2-7 | Shared components (DataTable, StatusBadge, PageHeader, ProspectCard) | Web |
| M2-8 | Supabase views + RPC for dashboard metrics | Database |
| M2-9 | Mobile assigned-prospects list | Mobile |
| M2-10 | Mobile real-time sync for assigned prospects | Mobile |

---

## 3. Execution plan — 6 stages

We break M2 into 6 sequential stages. Each stage has its own detailed doc. Stages build on each other — don't skip ahead.

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Foundation: shadcn components, shared UI, sidebar + dashboard shell | [stage-1-shared-ui-and-sidebar.md](stage-1-shared-ui-and-sidebar.md) |
| 2 | Prospects list page (filters, pagination, action buttons, RBAC) | [stage-2-prospects-list.md](stage-2-prospects-list.md) |
| 3 | Prospect detail page (tabs, overview, edit, activity) | [stage-3-prospect-detail.md](stage-3-prospect-detail.md) |
| 4 | Dashboard home with real metrics (views + RPC) | [stage-4-dashboard-metrics.md](stage-4-dashboard-metrics.md) |
| 5 | Real-time subscriptions (prospects + notifications) | [stage-5-realtime.md](stage-5-realtime.md) |
| 6 | Mobile: assigned prospects list + real-time sync | [stage-6-mobile-prospects.md](stage-6-mobile-prospects.md) |

---

## 4. Pre-requisites (must be done before starting M2)

These are **blockers** from M1 that the client expects finished:

- [ ] **M1-1**: Generate real Supabase database types
  ```bash
  npx supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts
  ```
  Without this, every Supabase query in M2 will be typed `never`.

- [ ] **M1-2**: Create seed data — at least 1 tenant, 4 users (one per role), 15 prospects, 5 appointments
  ```bash
  # supabase/seed/seed.sql — required to demo and test anything in M2
  ```

- [ ] **M1-3**: Storage RLS policies (tenant-scoped paths) — blocks document/photo features later
- [ ] Provision-tenant Edge Function deployed (for demo of onboarding flow)

> **Do not start Stage 1 until M1-1 and M1-2 are done.** Everything in M2 depends on real types and seed data.

---

## 5. Key architectural decisions for M2

### 5.1 Server Components by default
All data fetching for lists and detail pages happens in **Next.js Server Components** using the server-side Supabase client. Client components are only for interactivity (filters, tabs, real-time subscriptions).

**Why:** Avoids loading a client-side data-fetching library for M2. The cookie-based Supabase client on the server already gives us RLS + JWT auth for free.

### 5.2 Server Actions for mutations
Status changes, assignment changes, notes — all go through server actions, not client-side calls. Client components call actions; the action validates role, calls Supabase with the server client, then `revalidatePath()`.

**Why:** Keeps credentials and authorization on the server. Uniform error handling. Easy audit logging.

### 5.3 Real-time is additive
Server Components handle initial render. A small client component subscribes to `postgres_changes` and calls `router.refresh()` on change. No state duplication.

**Why:** Simpler mental model than Zustand/Redux. RSC data stays canonical.

### 5.4 Role-based access on every read
Every query checks role in the server component and either uses `.eq('assigned_to', userId)` (rufero) or fetches all (telefonista/admin/owner). RLS enforces the backstop.

**Why:** Defense in depth — app-layer filter + RLS policy.

### 5.5 URL-driven filters
Filters (city, status, search) live in the URL as search params. This makes filtered views shareable, back-button-friendly, and simplifies server-side rendering.

---

## 6. Definition of Done

- [ ] Telefonista logs in → sees dashboard with real counts
- [ ] Sidebar shows Dashboard, Prospects, Appointments (placeholder), Documents (placeholder), Communications (placeholder)
- [ ] Owner/admin additionally see Users, Analytics, Settings under Admin section
- [ ] Rufero sees only their assigned prospects
- [ ] Prospects list filters by city + status, paginates 60 per page
- [ ] Each prospect row shows 6 action buttons (Call, SMS, Email, Appt, Go, Notes)
- [ ] Click a prospect → detail page with all tabs rendered
- [ ] Status change is logged in `activities` table
- [ ] Dashboard metrics come from real queries, not hardcoded
- [ ] Changing a prospect in Studio → dashboard list updates without reload
- [ ] Mobile: rufero sees assigned prospects list, pull-to-refresh works, realtime updates
- [ ] RLS verified: Tenant A user → 0 Tenant B rows
- [ ] No `any`, no `never`-typed queries
- [ ] All new pages have loading skeletons

---

## 7. Out of scope for M2 (deferred to M3+)

- Google Maps / pins / proximity search → **M3**
- Full prospect create/edit form → **M3**
- DNC flag management → **M3**
- Call / SMS / Email actual integration → **M4**
- Appointment scheduling → **M5**

If you find yourself reaching for any of these, stop. Scope creep here pushes M3 out by a week.

---

## 8. Execution order

1. **Pre-reqs**: finish M1-1, M1-2, M1-3
2. **Stage 1**: shared UI + sidebar — unblocks all pages
3. **Stage 2**: prospects list
4. **Stage 3**: prospect detail
5. **Stage 4**: dashboard metrics (can parallelize with Stage 3)
6. **Stage 5**: real-time (layered on Stages 2 and 4)
7. **Stage 6**: mobile (can start after Stage 2)

---

## 9. Success demo script (for client)

At the end of M2, demo this in under 5 minutes:

1. Log in as `owner@demo.com` → dashboard shows real counts from seed
2. Click **Prospects** → filtered list with pagination
3. Filter by city "Dallas" + status "New Leads" → click **Query Database**
4. Click a prospect → full detail page with 5 tabs
5. Change status → activity tab shows the change
6. Open Supabase Studio → change another prospect → dashboard list updates live
7. Log out → log in as `rufero@demo.com` → only assigned prospects visible
8. Open Flutter app as same rufero → same assigned prospects, pull to refresh

If all 8 steps work, M2 is done.
