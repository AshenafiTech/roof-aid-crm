# Milestone 3 — Dashboard Polish + Maps

**Duration:** Week 4
**Goal:** Add Google Maps integration, proximity search, and complete the prospect profile into a fully functional record view. Bring the mobile app up to parity with a map view and detailed prospect tabs.

---

## 1. Why this milestone matters

Milestone 2 gave Telefonistas a working prospect list and a real dashboard. But a roofing CRM without **spatial context** is useless in the field — storm leads cluster geographically, Ruferos need to route efficiently, and "show me every prospect within 10 miles of this pin" is the single most-used filter in the industry.

Milestone 3 delivers the features that make Roof-Aid feel like a **real field-ops platform**:

1. See every filtered prospect as a colored pin on a map
2. Right-click a location → find every prospect within N miles
3. Create/edit prospects with validated addresses that geocode automatically
4. Assign (and re-assign) prospects to Ruferos with an audit trail
5. Honor DNC flags everywhere — one missed flag is a $500–$1,500 TCPA fine
6. Give Ruferos a mobile map with one-tap turn-by-turn navigation
7. Let Ruferos drill into the full prospect profile on the phone

After M3 the platform is **demo-ready for a real roofing company** — you can stand next to an owner in their office and show them the product they'd actually use every day.

---

## 2. Scope summary (from blueprint M3)

| # | Task | Surface |
|---|------|---------|
| M3-1 | Google Maps on dashboard (color-coded pins, click-to-focus) | Web |
| M3-2 | Proximity search (right-click + radius picker, PostGIS `ST_DWithin`) | Web + DB |
| M3-3 | Full prospect profile tabs (Calls, SMS, Email, Appts, Docs, Inspection, Map) | Web |
| M3-4 | Prospect create/edit form with Zod + address geocoding | Web |
| M3-5 | Prospect assignment workflow (owner/admin only, activity logged, notification sent) | Web |
| M3-6 | DNC flag management (profile-only, reason required, disables Call/SMS everywhere) | Web |
| M3-7 | Mobile map view with color-coded pins + "Navigate" deep link | Mobile |
| M3-8 | Mobile prospect detail with tabs matching web | Mobile |

---

## 3. Execution plan — 6 stages

We break M3 into 6 sequential stages. Each stage has its own detailed doc. The web stages (1–4) build on each other. Mobile stages (5–6) can start in parallel once Stage 3 has shipped the shared data contract.

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Web map integration: Maps SDK + color-coded pins + click-to-focus | [stage-1-web-maps.md](stage-1-web-maps.md) |
| 2 | Proximity search: PostGIS RPC + right-click modal + radius UI | [stage-2-proximity-search.md](stage-2-proximity-search.md) |
| 3 | Prospect create/edit + geocoding + assignment + DNC | [stage-3-prospect-crud-assignment-dnc.md](stage-3-prospect-crud-assignment-dnc.md) |
| 4 | Full prospect profile tabs (remaining tabs with real data or M4/M5 stubs) | [stage-4-prospect-profile-tabs.md](stage-4-prospect-profile-tabs.md) |
| 5 | Mobile map view with navigation deep-link | [stage-5-mobile-map.md](stage-5-mobile-map.md) |
| 6 | Mobile prospect detail tabs | [stage-6-mobile-prospect-detail.md](stage-6-mobile-prospect-detail.md) |

---

## 4. Pre-requisites (must be done before starting M3)

These are blockers the client expects completed before Stage 1 begins.

- [ ] **M2 Definition of Done signed off** — every item in `docs/milestone2/README.md` §6 must be green
- [ ] **Google Maps API key provisioned** — one key per environment (dev/staging/prod) with restrictions:
  - Browser key: HTTP referrers locked to localhost + production domain
  - Enable: Maps JavaScript API, Places API, Geocoding API
  - Mobile: separate Android + iOS keys with package/bundle restrictions
- [ ] **PostGIS extension enabled** — check with:
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'postgis';
  ```
  If missing, add migration `009_postgis.sql`: `CREATE EXTENSION IF NOT EXISTS postgis;`
- [ ] **`prospects.coordinates` column is PostGIS `geography(Point,4326)`** — the blueprint uses `point`; a one-time migration to `geography` is required for `ST_DWithin` with meter-accurate radius
- [ ] **Seed data includes geocoded prospects** — at least 15 seed prospects with real lat/lng, spread across a realistic metro area (e.g. Dallas: 5 in Plano, 5 in Arlington, 5 in Frisco). Required to demo proximity search
- [ ] **Environment variables added** to `.env.example`:
  ```
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
  GOOGLE_MAPS_SERVER_KEY=   # for server-side geocoding
  ```

> Do not start Stage 1 until PostGIS + coordinate migration is done. Stage 2 hard-depends on it, and the coordinate schema change is destructive if left for later.

---

## 5. Key architectural decisions for M3

### 5.1 Client-side map, server-side geocoding
The map itself runs in the browser (`@vis.gl/react-google-maps`) so pin interaction is snappy. But any address → lat/lng conversion runs on the **server** in a route handler using `GOOGLE_MAPS_SERVER_KEY`. Never expose the server key to the client, never call Geocoding API from the browser.

**Why:** Server-side geocoding prevents quota theft, caches deterministically, and keeps billing predictable.

### 5.2 PostGIS for proximity, not JS distance math
All radius searches use `ST_DWithin(coordinates, ST_MakePoint(...)::geography, radius_meters)`. Never fetch all prospects and filter in Node.

**Why:** A 10k-prospect tenant filtered to "within 10 miles" returns in ~20ms with a GiST index vs. ~800ms in JS. Also: correct great-circle math, not Pythagorean approximation.

### 5.3 Proximity search is a SECURITY DEFINER RPC
Expose proximity via `search_prospects_by_radius(lat, lng, radius_m, status_filter)` as a `SECURITY DEFINER` function with explicit `WHERE tenant_id = get_tenant_id()`. Called from server components only.

**Why:** The RPC is the tenant-scoped entry point — easier to audit one function than a dozen call sites.

### 5.4 Assignment = two tables + one function
Changing `prospects.assigned_to` happens inside a PL/pgSQL function `assign_prospect(prospect_id, rufero_id)` that:
1. Updates `prospects` (assigned_to, assigned_by, assigned_at)
2. Inserts into `activities`
3. Inserts into `notifications` for the rufero

**Why:** One atomic transaction. No race condition where the activity log is missing the assignment. Simpler to invoke than three separate inserts.

### 5.5 DNC is permanent — no deletes, ever
DNC records never delete. DNC toggle only sets `do_not_call = true` with a reason and timestamp. Unflagging requires a separate "DNC appeal" workflow that's explicitly out of scope for M3 (actually illegal in most states without written consent).

**Why:** TCPA compliance. An auditor needs to see *when* a number was flagged and *who* flagged it, for the full life of the record.

### 5.6 Mobile uses the same RPC
`mobile → supabase.rpc('search_prospects_by_radius', {...})` — no duplicate Dart distance math, no drift between web and mobile results.

### 5.7 Map pins read from the same list query
The map component consumes the exact same prospect array the list renders. No second fetch, no sync bug. "What's on the list is what's on the map."

---

## 6. Definition of Done

### Web
- [ ] Dashboard map shows a color-coded pin for every prospect in the filtered list
- [ ] Clicking a pin highlights its card in the list (and scrolls into view)
- [ ] Right-click on map opens Proximity Search modal with radius picker (5/10/25/50 mi)
- [ ] Proximity search returns results correctly — verified with two prospects 3 mi apart, radius = 5 mi includes both; radius = 2 mi includes only the center
- [ ] Top-bar "Near Me" button uses browser geolocation → opens proximity modal pre-filled
- [ ] Prospect create/edit form: validates with Zod, geocodes address on save, stores coordinates
- [ ] Assignment dropdown visible only to owner/admin; logged in activities; rufero gets notification
- [ ] DNC toggle is on the full profile only (NOT on the row card); requires reason; Call/SMS buttons disabled everywhere for DNC prospects
- [ ] All 5 remaining profile tabs render (Calls, SMS, Email, Appts, Docs, Inspection, Map) — data-populated if present, empty-state if not
- [ ] Mini Map tab on prospect profile shows the single pin with Street View link

### Mobile
- [ ] Map screen shows only pins for the Rufero's assigned prospects
- [ ] Tap a pin → prospect detail page
- [ ] "Navigate" button opens Google Maps (Android) / Apple Maps (iOS) with turn-by-turn to the prospect address
- [ ] Prospect detail has tabs: Overview, Calls, SMS, Appointments, Documents, Inspection, Notes — all render, data-populated or empty-state

### Cross-cutting
- [ ] Cross-tenant isolation verified: Tenant A user gets 0 rows when proximity-searching within Tenant B's footprint
- [ ] Lighthouse score on dashboard ≥ 85 with map mounted
- [ ] No raw lat/lng leaks in client errors; all API keys environment-loaded
- [ ] `.env.example` updated with every new variable
- [ ] Seed data updated with real coordinates for the demo city

---

## 7. Out of scope for M3 (deferred to M4+)

- Telnyx click-to-call actually dialing → **M4**
- SMS send/receive → **M4**
- Email send via SendGrid → **M4**
- Appointment scheduling workflow → **M5**
- PDF document generation → **M5**
- Inspection photo capture → **M5/M6**
- Push notifications → **M6**

Tabs for Calls/SMS/Email/Appts/Docs/Inspection render in M3 as **data-only views** — if rows exist in `call_logs` etc. from seed data, show them; if not, show an empty state. The *ability to create those rows* lands in later milestones.

---

## 8. Execution order

1. **Pre-reqs**: PostGIS extension, coordinate column migration, API keys, geocoded seed data
2. **Stage 1** — web map + pins: unblocks the dashboard UX
3. **Stage 2** — proximity search: layered on Stage 1
4. **Stage 3** — prospect CRUD + assignment + DNC: can parallelize with Stage 2 if a second pair of hands is available
5. **Stage 4** — full prospect profile tabs: requires Stage 3 (edit form) to be shipped
6. **Stage 5** — mobile map: can start after Stage 2 (shared RPC contract)
7. **Stage 6** — mobile prospect detail: can start after Stage 4

---

## 9. Success demo script (for client)

At the end of M3, demo this in under 7 minutes:

1. Log in as `owner@demo.com` → dashboard with map on the right, 60 prospect cards on the left
2. Filter by city "Plano" + status "New Leads" → map re-centers and shows only Plano pins
3. Click a pin on the map → the corresponding card highlights and the list scrolls to it
4. Right-click a point near Plano → Proximity Search modal → 10-mile radius → 12 results, all within a 10-mile ring
5. Click top-bar "Near Me" → browser prompts for location → modal opens pre-filled with current GPS
6. Click into a prospect → full profile with 10 tabs; click Map tab → mini embedded map with Street View link
7. Click "Edit" → update address → save → confirm coordinates moved the pin
8. Change assignment to `rufero@demo.com` → Activity tab shows the assignment event
9. Toggle DNC on with reason "requested removal" → Call and SMS buttons grey out across the entire app
10. Open Flutter app as `rufero@demo.com` → Map tab shows pins only for their assignments → tap pin → "Navigate" opens Google Maps directions

If all 10 steps work end-to-end with real data, M3 is done.
