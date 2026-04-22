# Milestone 2 — Gap Analysis: Requirements vs Implementation

**Date:** 2026-04-16  
**Scope:** Compare the FINAL client requirements document (V4.0) against the current M2 implementation and the project blueprint milestones.

---

## 1. What M2 Got Right

### 1.1 Core pipeline is functional
The 6-status pipeline (`new_leads` → `prospects` → `contacted` → `scheduled` → `closed_customer` → `not_viable`) matches the client spec Section 7.1 exactly. Status transitions work with role-based permissions, and every change is logged in the activity table.

### 1.2 Server Components + Server Actions architecture
The client spec demands no blocking scripts and sub-500ms dashboard loads. Using RSC for all data fetching and server actions for mutations is the right call — no client-side JS needed for initial render.

### 1.3 Defense-in-depth RBAC
The spec requires roles enforced at the database level (Section 6, 17.1). M2 implements both app-layer permissions (`permissions.ts`) and Supabase RLS policies. This matches the "security rules are the law, frontend is UX only" principle.

### 1.4 Multi-tenant isolation from day one
Every query is tenant-scoped. RLS enforces `tenant_id = get_tenant_id()` on every table. This satisfies Section 17.1: "No cross-tenant data access is possible from any code path."

### 1.5 Activity logging on every mutation
Section 11.3 lists 20+ event types that must be logged. M2 logs `prospect_update`, `status_change`, `assignment`, and `note_added` from the start — the audit trail foundation is solid.

### 1.6 URL-driven filters
The client spec (Section 7.2) describes city dropdown + status dropdown + query button. M2 implements all three as URL search params, making views shareable and back-button-friendly.

### 1.7 Seed data from real production records
~320 prospects seeded from real Excel data. This means the demo script can run against realistic data, not lorem ipsum.

---

## 2. What M2 Got Wrong (Against the Client Spec)

### 2.1 Dashboard layout doesn't match the spec at all

**Spec (Section 7.2):** The dashboard is a **split-screen** — left panel is the prospect list (60 cards), right panel is a Google Map with color-coded pins. Filters sit above both panels. This is the primary daily-driver screen.

**Current M2:** The dashboard is a **metrics page** — KPI cards, pipeline breakdown chart, and recent activity feed. There is no prospect list on the dashboard. There is no map. The prospect list lives on a separate `/prospects` route.

**Impact:** This is a fundamental UX deviation. The client's Telefonistas expect to see prospects and the map on the same screen. Having to navigate to a separate page breaks the workflow described in Section 24.2 (Daily Telefonista Workflow).

**Fix:** M3 should either merge the prospects list into the dashboard with the map, or the "dashboard" route should BE the prospect list + map. The current metrics view could become `/analytics` or a summary widget above the main workspace.

### 2.2 Anti-Collision System (Section 30) is completely missing

**Spec (Section 30):** The system loads exactly 60 records per page. The display order rotates based on the current second (0-59), so two agents loading at the same moment see the same order, but agents loading 5 seconds apart see different starting points. This prevents two Telefonistas from calling the same person.

```
const offset = new Date().getSeconds();
displayList = [...prospects.slice(offset), ...prospects.slice(0, offset)];
```

**Current M2:** Standard `ORDER BY created_at DESC` with no rotation. Every agent sees the exact same list in the exact same order. The first prospect on the list gets called by everyone.

**Impact:** This is a business-critical feature — it's the reason the page size is 60 (one per second in a rotation cycle). Without it, multiple Telefonistas will call the same homeowner simultaneously, wasting time and annoying customers.

**Fix:** Implement client-side rotation in the prospects list component. The query stays the same (fetch 60 sorted records); the display order is rotated based on `new Date().getSeconds()`.

### 2.3 Google Maps integration is completely missing

**Spec (Section 7.2):** Right panel is Google Maps. Pins color-coded by status. Click pin highlights card. Right-click opens proximity search. Top bar has GPS-based proximity button.

**Current M2:** No map anywhere. No `@googlemaps/js-api-loader` or equivalent installed. The `coordinates` column exists in the database but is unused.

**Impact:** The map is not a nice-to-have — it's half the main screen. Ruferos need it to see where prospects are. Telefonistas need it to prioritize by geography.

**Fix:** This is correctly planned for M3 (M3-1, M3-2). Confirm it's the #1 priority in M3.

### 2.4 Prospect card layout doesn't match the spec

**Spec (Section 7.2):** Each card shows: name, address, home value, hail size, city, tipo, and 6 action buttons (Call | SMS | Email | Appt | Go | Notes). "DNC is NOT on the card."

**Current M2:** Cards are table rows, not cards. Missing fields: `tipo` and `source`. The `tipo` field isn't even in the Supabase schema migration despite being in the client's data model (Section 7.4).

**Fix:** Add `tipo` and `source` columns to the prospects table. Consider switching from table rows to actual cards to match the spec's visual language more closely, or accept the table format as a UX improvement over the spec.

### 2.5 "Load 60 More" pagination vs current prev/next

**Spec (Section 7.2):** "Load 60 More" button — additive loading. Previous results stay visible. Record count shows "50 de 150" format.

**Current M2:** Standard page-based pagination with Previous/Next. Navigating to page 2 replaces page 1 results.

**Impact:** Minor UX difference, but the spec explicitly wants additive "load more" behavior so agents can scroll back to prospects they saw earlier without losing their place.

**Fix:** Switch to cursor-based infinite scroll with "Load 60 More" button. Display count as "X de Y" format.

### 2.6 DNC compliance features are incomplete

**Spec (Section 7.5 — marked CRITICAL):**
- DNC flag disables Call and SMS buttons everywhere
- Auto-DNC on SMS STOP reply
- DNC records never deleted (permanent audit trail)
- `doNotCallReason` and `doNotCallAt` fields required
- National DNC Registry check stub required

**Current M2:** The `do_not_call` boolean exists in the schema and Call/SMS buttons are disabled when true. But:
- No `do_not_call_reason` or `do_not_call_at` fields in the schema
- No DNC toggle on the prospect detail page
- No audit trail for DNC changes
- No stub for `checkDNCRegistry()`

**Fix:** Add missing DNC fields to the schema. M3-6 covers DNC flag management on the profile — make sure it includes the reason field, timestamp, and activity log entry.

### 2.7 Activities RLS is broken for 2 of 4 roles

**Spec (Section 6.1):** Activity logs visible to: Super Admin (platform), Owner (tenant), Admin (tenant), Telefonista (own only). Rufero: NO.

**Current M2 RLS:**
```sql
public.get_user_role() IN ('owner', 'admin')
```

Telefonista is locked out (should see own activities per spec). No INSERT policy exists, so server actions that log activities will fail with RLS violations.

**Fix:** This is a merge blocker. Add INSERT policy for all authenticated users. Expand SELECT to include `telefonista` with `user_id = auth.uid()` filter. Keep rufero locked out per spec.

### 2.8 Prospect profile is missing 7 of 12 tabs from the spec

**Spec (Section 7.3):** 12 tabs: Overview, Pipeline, Assignment, Calls, SMS, Email, Appointments, Documents, Inspection, Activity, Notes, Map.

**Current M2:** 5 tabs: Overview, Pipeline, Assignment, Activity, Notes.

**Missing:** Calls, SMS, Email, Appointments, Documents, Inspection, Map.

**Impact:** Expected for M2 scope. But the blueprint's M3 (M3-3) says "Complete all remaining tabs" — this is a massive amount of work for a single M3 task. Each missing tab requires its own data layer, UI, and real-time subscription.

**Recommendation:** Don't try to build all 7 tabs in M3. Communication tabs (Calls, SMS, Email) depend on M4 (Telnyx/SendGrid integration). Documents depends on M5. Inspection depends on M6. Only the Map tab and Appointments tab can realistically be done in M3.

### 2.9 Tech stack deviation from client spec

**Client spec:** Firebase (Firestore, Cloud Functions, Firebase Auth, Firebase Hosting), React + Vite, React Native for mobile.

**Current implementation:** Supabase (PostgreSQL), Next.js 15 (App Router), Flutter for mobile.

This was a deliberate architectural decision documented in the blueprint. It's the right call (PostgreSQL > Firestore for relational CRM data, PostGIS for geo queries, RLS > Security Rules for tenant isolation). But it means the spec's build guide (Steps 1-14) doesn't apply directly — it was written for Firebase. The milestone structure in the blueprint is the correct reference, not the spec's step-by-step.

---

## 3. What's Missing from M2 (Incomplete Deliverables)

| # | Item | Spec Reference | Status | Impact |
|---|------|---------------|--------|--------|
| 3.1 | Mobile assigned-prospects list | Section 12.1 (My Prospects) | Empty scaffolding | Demo script step 8 fails |
| 3.2 | Anti-Collision rotation | Section 30 | Not implemented | Multiple agents call same prospect |
| 3.3 | Dashboard map + list layout | Section 7.2 | Wrong layout entirely | Core UX doesn't match spec |
| 3.4 | `tipo` and `source` fields | Section 7.4 | Not in schema | Data model incomplete |
| 3.5 | DNC reason/timestamp fields | Section 7.5 | Not in schema | Compliance gap |
| 3.6 | Activities INSERT RLS policy | Section 17.1 | Missing | Server actions will fail |
| 3.7 | Activities SELECT for telefonista | Section 6.1 | Missing | Feature broken for role |
| 3.8 | Onboarding checklist | Section 20.1 (Phase 1 required) | Not implemented | Spec says required Phase 1 |
| 3.9 | "Load 60 More" pagination | Section 7.2 | Standard prev/next instead | UX deviation |
| 3.10 | PWA support | Section 4.3 (Phase 1 required) | Not implemented | Spec says required Phase 1 |

---

## 4. How to Improve the Milestones

### 4.1 The dashboard identity problem

The blueprint puts the dashboard metrics in M2 and the map in M3. But the client spec says the dashboard IS the prospect list + map. The metrics are analytics (Section 11.2), not the dashboard.

**Recommendation:** Redefine "Dashboard" to match the client spec — it's the prospect workspace with map. Move the current metrics cards to an Analytics summary widget or to M7's analytics page.

### 4.2 Anti-Collision should be M2, not deferred

The client spec ties the 60-record page size directly to the Anti-Collision System. It's a 10-line client-side rotation — not a complex feature. It should have been in M2 Stage 2 (prospect list).

**Recommendation:** Implement it immediately as a hotfix before M3 starts. It's trivial to add:
```tsx
const offset = new Date().getSeconds();
const rotated = [...rows.slice(offset), ...rows.slice(0, offset)];
```

### 4.3 M3 is overloaded — split it

The blueprint's M3 tries to do too much in one week:
- Google Maps integration (M3-1) — 2-3 days alone
- Proximity search with PostGIS (M3-2) — 1-2 days
- Complete 7 remaining profile tabs (M3-3) — unrealistic, most depend on M4-M6
- Full prospect create/edit form with geocoding (M3-4) — 1 day
- Prospect assignment improvements (M3-5) — already partially done in M2
- DNC flag management (M3-6) — 0.5 day
- Mobile map view (M3-7) — 1-2 days
- Mobile prospect detail tabs (M3-8) — depends on M3-3

That's 2+ weeks of work labeled as 1 week (Week 4).

**Recommendation:** Split M3 into two milestones:

**M3a — Maps & Prospect Workspace (1 week):**
- Merge prospect list into dashboard with map (fix the layout problem)
- Google Maps with color-coded pins
- Proximity search (PostGIS `ST_DWithin`)
- Anti-Collision rotation
- Full prospect create/edit form with geocoding
- DNC flag management on profile
- "Load 60 More" pagination

**M3b — Mobile & Profile Polish (1 week):**
- Mobile assigned-prospects list (deferred from M2 Stage 6)
- Mobile map view with navigation
- Appointments tab on prospect profile (data exists from M2 schema)
- Map tab on prospect profile (mini embedded map)
- Mobile prospect detail (overview + notes + map tabs only — others wait for M4-M6)

### 4.4 Add missing schema fields before M3

Before M3 development starts, run a migration to add:
- `tipo` (varchar) on prospects
- `source` (varchar, default 'manual') on prospects
- `do_not_call_reason` (text) on prospects
- `do_not_call_at` (timestamptz) on prospects
- Fix activities RLS (INSERT policy + expanded SELECT)

This is a 30-minute task that unblocks multiple M3 features.

### 4.5 Move onboarding checklist earlier

The client spec says the onboarding checklist is a **Phase 1 required** UI component (Section 20.1). It's currently not in any milestone.

**Recommendation:** Add it to M3a. It's a standalone component (7 checkboxes with action buttons) that doesn't depend on any other feature being complete — the action buttons can link to placeholder pages for features that aren't built yet.

### 4.6 PWA support should be addressed

Section 4.3 says PWA is a "Phase 1 required deliverable." Next.js supports PWA via `next-pwa` or a manual service worker. The offline queue (status updates, notes sync when connection restores) is critical for ruferos.

**Recommendation:** Add basic PWA manifest + service worker to M3a. Full offline queue can wait for M6 (Mobile Deep Dive + Offline).

### 4.7 Performance debt must be paid before M3 adds more features

M2 has several performance issues that will compound when M3 adds maps, proximity search, and more real-time surfaces:

| Issue | Current Cost | M3 Cost if Unfixed |
|-------|-------------|-------------------|
| 7-query dashboard fanout | ~200ms | Irrelevant if dashboard becomes prospect list |
| Unthrottled `router.refresh()` | Occasional flicker | Map + list + metrics all re-render on every event |
| `listCities()` full table scan | ~50ms at 320 rows | ~500ms at 5k rows |
| Auth round-trip per request | 100-400ms | Every map interaction triggers it |
| No caching strategy | Redundant fetches | City list, rufero list fetched on every navigation |

**Recommendation:** Fix these in a "M2.5 — Performance & Correctness" sprint (2-3 days) before starting M3:
1. Fix activities RLS (merge blocker)
2. Debounce realtime refreshes (300ms)
3. Switch middleware to `getSession()`
4. Replace `listCities()` with `SELECT DISTINCT` RPC
5. Add `unstable_cache` for reference data
6. Extract shared `requireAuth()` utility

### 4.8 Supplement milestone timing

The blueprint doesn't assign supplements to a specific milestone. Based on dependencies:
- Supplements need: inspection data (M6), document generation (M5), Stripe billing (M8)
- The supplement CRUD and workflow should start in **M6** alongside inspections
- Commission billing (Stripe integration) stays in **M8**
- ML writing assistant is a separate enhancement (M9 or post-launch)

### 4.9 Test infrastructure cannot wait until M9

The client spec (Section 5.2) says "every pull request must meet standards before merging." Zero tests exist today. The longer you wait, the harder it is to add them.

**Recommendation:** Start with 3 critical test categories in M3:
1. **RLS verification tests** — confirm tenant isolation (highest ROI)
2. **Permission function unit tests** — `canTransition()`, `canAssignProspects()`
3. **Server action integration tests** — verify mutations + activity logging

---

## 5. Revised Milestone Roadmap (Suggested)

| Milestone | Duration | Focus | Key Change from Blueprint |
|-----------|----------|-------|--------------------------|
| M2.5 | 2-3 days | Performance fixes + RLS corrections | NEW — pay down M2 debt |
| M3a | 1 week | Maps + Prospect Workspace + Anti-Collision | Dashboard becomes the prospect workspace |
| M3b | 1 week | Mobile prospects + Profile polish | Absorbs M2 Stage 6 + mobile map |
| M4 | 1 week | Communication (Phone/SMS/Email) | Unchanged |
| M5 | 1 week | Appointments + Documents + E-Signature | Unchanged |
| M6 | 1.5 weeks | Mobile Deep Dive + Offline + Supplement CRUD | Supplements start here |
| M7 | 1 week | Admin, Analytics, Onboarding | Unchanged |
| M8 | 1 week | Billing, Commission Billing, Security | Supplement commission billing |
| M9 | 1 week | QA, Testing, Launch Prep | Unchanged |

---

## 6. Summary

**M2 delivered a working CRM foundation** — the prospect pipeline, role-based access, activity logging, and real-time updates are all solid. The architecture (Server Components, Server Actions, RLS) is better suited for this use case than what the client spec originally prescribed (Firebase + Vanilla JS).

**But M2 diverges from the client spec in two critical ways:**
1. The dashboard layout is wrong — it should be prospect list + map, not metrics cards
2. The Anti-Collision System is missing — this is a core business differentiator

**The fix is manageable:** A short performance sprint (M2.5), followed by a properly scoped M3 that prioritizes the map integration and corrects the dashboard layout. The rest of the milestones stay on track with minor adjustments.

**Three things to do before writing any M3 code:**
1. Fix activities RLS (INSERT + SELECT policies)
2. Add missing schema fields (`tipo`, `source`, DNC fields)
3. Implement Anti-Collision rotation (10 lines of client-side code)
