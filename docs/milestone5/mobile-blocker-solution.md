# M5 — Mobile Blocker Solution / Status Audit

**Audience:** web developer picking up the M5 work.
**Purpose:** for every item in [web-dependencies-for-mobile.md](web-dependencies-for-mobile.md), report whether it is already implemented on the web side, and — if not — exactly what needs to be built and where.

> Path note: the blocker doc lives at `docs/milestone5/web-dependencies-for-mobile.md` (no dash), not `docs/milestone-5/…`. The deleted entries in `git status` are stale paths from before the folder was renamed.

---

## TL;DR — implementation status

| # | Blocker | Status | Action needed |
|---|---------|--------|---------------|
| 1 | Stage 1 migration (schema + RPCs) | ❌ Not implemented | Net-new migration file |
| 2 | `transition_appointment` Supabase RPC | ❌ Not implemented | New RPC + refactor any web caller |
| 3 | Stage 7 mobile-tables migration (`photos` + `inspection_reports` cols) | ❌ Not implemented | Add to the Stage 1 migration sweep |
| 4 | Stage 4 Edge Functions (`generate-pdf`, `embed-signature`) | ❌ Not implemented | New Supabase functions |
| 5 | Realtime on `rufero_availability_blocks` | ❌ Not enabled (table missing) | Add to `007_enable_realtime.sql` after Blocker 1 |
| — | Contract decision §3.1 (status values: `no_show` vs `"no-show"`) | ⚠️ Conflict in current code | Resolve before Stage 2 |

**Headline:** none of the five web-side blockers has been landed. The web app has a basic `/appointments` calendar/list/filters and an empty `/documents` placeholder — the schema and server logic the mobile build needs are all still TODO.

---

## 1. Blocker-by-blocker audit

### Blocker 1 — Stage 1 migration  ❌ Not implemented

**What exists today** (`supabase/migrations/002_core_tables.sql`):

- `appointments` table is present with `id, tenant_id, prospect_id, rufero_id, scheduled_at, duration_minutes, status, notes, cancellation_reason, rescheduled_from, reminder_24h_sent, reminder_2h_sent, …` (lines 88–105).
- `users.home_base_coords` exists (line 51).

**What is missing:**

| Item | Where it should land |
|---|---|
| `appointments.scheduled_range tstzrange GENERATED ALWAYS AS …` | New migration |
| `appointments_scheduled_range_gist` index | New migration |
| `appointments_no_overlap` EXCLUDE constraint (status IN pending/confirmed) | New migration |
| `users.home_base_address text` | New migration |
| `users.working_hours jsonb` | New migration |
| `tenants.working_hours jsonb DEFAULT '{…}'` | New migration |
| `rufero_availability_blocks` table (full DDL in blocker doc §1, lines 48–69) | New migration |
| `rufero_blocks_rufero_range_gist` index | New migration |
| `availability_blocks_no_overlap` EXCLUDE constraint (kind='busy') | New migration |
| RLS on `rufero_availability_blocks` (per stage-1 §2.1) | New migration |
| `can_schedule(...)` RPC — must consult blocks + per-rufero hours | New migration |
| `suggest_rufero_for_prospect(...)` RPC | New migration |

**Also fix while you're in there:** the existing `appointments.status` CHECK constraint allows `'no-show'` (with hyphen). The M5 contract (§3.1) and `transition_appointment` API (§3.3) expect `'no_show'` (underscore). Pick one and migrate — see "Decision 3.1" below.

**Suggested filename:** `supabase/migrations/025_m5_appointments_and_availability.sql`.

---

### Blocker 2 — `transition_appointment` RPC  ❌ Not implemented

**What exists today** (`apps/web/app/(dashboard)/appointments/actions.ts`):

- Server actions: `assignAppointmentRufero`, `listRuferos`, prospect-status side-effects on assignment.
- **No** transition logic for `confirmed / cancelled / completed / no_show / rescheduled`. Status changes are not exposed as either a server action or an RPC today.

**What to build:**

1. Create the RPC with the exact signature from blocker doc §3.3:

   ```sql
   CREATE OR REPLACE FUNCTION transition_appointment(
     p_appointment_id uuid,
     p_to text,
     p_reason text DEFAULT NULL
   ) RETURNS jsonb
   ```

   - Validates the caller's role via `auth.uid()` and the transition matrix from `stage-2-calendar-and-status.md §3`.
   - Requires non-empty `p_reason` when `p_to IN ('cancelled', 'no_show')`.
   - Updates `appointments.status` (+ `cancellation_reason`).
   - Cascades to `prospects.status` when the transition warrants it (table in `stage-2 §3`).
   - Returns `{ ok: true }` or `{ ok: false, error: { code, message } }` with codes `forbidden | reason_required | invalid_transition`.

2. Have the web's Stage 2 status-change UI call `supabase.rpc('transition_appointment', …)` instead of a server action, so web and mobile share one code path.

**Lands with:** Stage 2 web work.

---

### Blocker 3 — Stage 7 mobile-tables migration  ❌ Not implemented

**What exists today:**

- `inspection_reports` table exists at `supabase/migrations/002_core_tables.sql:244` with columns `id, tenant_id, prospect_id, appointment_id, rufero_id, damage_data, photo_urls, ai_analysis, created_at, updated_at`.
- **No** `photos` table.

**What is missing** (full DDL in blocker doc §1 lines 127–162):

- `inspection_reports` add: `roof_age_years, roof_material, storm_date, affected_areas, severity, scope_notes, photo_count_expected, completed_at`.
- New `photos` table with tenant FK, inspection FK, prospect FK, `storage_path, tags text[], gps_lat/lng, taken_at, uploaded_at, width_px, height_px, file_size_bytes, created_by`.
- Indexes `photos_inspection_idx`, `photos_prospect_idx`.
- RLS: `photos_select_tenant`, `photos_insert_tenant` (using `current_tenant_id()`).

**Recommendation:** bundle into the same migration file as Blocker 1.

---

### Blocker 4 — Stage 4 Edge Functions  ❌ Not implemented

`supabase/functions/` currently contains only `provision-tenant/`, `telnyx-webhook/`, `_shared/`. Both Stage 4 functions are net-new:

- `supabase/functions/generate-pdf/` — accepts `{ prospect_id, template_kind, fields? }`, returns `{ document: {...} }`. Writes PDF to `documents/{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf`.
- `supabase/functions/embed-signature/` — accepts `{ document_id, signature_png_base64, signer_name, device_metadata }`, returns `{ signed_document: {...} }`. Writes signed PDF + sig PNG to the storage paths in §3.5.

Deploy both to **dev** before mobile Stage 8 wires up its offline sync worker. Until then, mobile will keep the calls stubbed.

---

### Blocker 5 — Realtime on `rufero_availability_blocks`  ❌ Not enabled

The table does not exist yet, so realtime is necessarily off. Once Blocker 1 lands, add this block to `supabase/migrations/007_enable_realtime.sql` (matching the existing idempotent pattern):

```sql
if not exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rufero_availability_blocks'
) then
  alter publication supabase_realtime add table public.rufero_availability_blocks;
end if;
```

Or, equivalently, toggle Realtime on for the table in the Supabase dashboard (Database → Replication). Doing it in SQL keeps dev/prod in sync via migrations.

While you're there, consider also enabling Realtime for `appointments` if Stage 2's calendar wants live updates — the blocker doc doesn't strictly require it for mobile, but it's a tiny add.

---

## 2. Contract decisions — current state in code

The blocker doc lists 6 contracts that must be locked before either side codes. Status:

| # | Decision | Current code state | Action |
|---|---|---|---|
| 3.1 | Appointment status DB values + colors | `appointment-calendar.tsx:14–22` uses `"no-show"` (hyphen). DB CHECK at `002_core_tables.sql:97` also uses `'no-show'`. Mobile blocker doc + RPC §3.3 use `no_show` (underscore). | **Pick one and migrate.** Recommend underscore (matches `pending / confirmed / completed / cancelled / rescheduled` — none use hyphens, and underscores read cleaner in code). Migration must update the CHECK constraint and rewrite existing rows. |
| 3.2 | Photo tags canonical list | No web code consumes tags yet. | Just confirm the list in §3.2 is acceptable for future M7+ filters. No code change. |
| 3.3 | `transition_appointment` RPC shape | RPC doesn't exist. | Build per §3.3 exactly. |
| 3.4 | `generate-pdf` / `embed-signature` JSON | Functions don't exist. | Build per stage-4 §4.1 + §5.1. |
| 3.5 | Storage paths | No documents/photos storage code yet. | Use the four prefixes in §3.5 verbatim in the Edge Functions. |
| 3.6 | `rufero_availability_blocks` row shape + `users.working_hours` JSON | Neither table/column exists. | Bake the shapes into the Blocker 1 migration. |

---

## 3. Suggested order of execution (web side)

Following the table in blocker doc §4, adjusted to what's actually in the repo:

1. **Resolve Decision 3.1** (`no-show` → `no_show`) so it folds into the Blocker 1 migration cleanly.
2. **Ship migration `025_m5_appointments_and_availability.sql`** — bundles Blocker 1 + Blocker 3, plus the realtime publication add for Blocker 5.
3. **Add `transition_appointment` RPC** (Blocker 2) — small enough to ship in `026_*.sql` with the Stage 2 PR.
4. **Build Stage 4 Edge Functions** (`generate-pdf`, `embed-signature`) and deploy to dev (Blocker 4).
5. Web-only stages (2, 5, 6) — no mobile coupling beyond the contracts above.

Mobile can keep moving against stubs in parallel from step 1 onward; each landing above turns one stub into a real call.

---

## 4. File map (where each piece lives)

- Migrations: `supabase/migrations/` — add new files with the next free numeric prefix (next free is `025_…`).
- Realtime publication: `supabase/migrations/007_enable_realtime.sql` (extend the existing idempotent block).
- Edge Functions: `supabase/functions/<fn-name>/index.ts` (mirror layout of `provision-tenant/`).
- Web appointment UI: `apps/web/app/(dashboard)/appointments/`.
- Web documents UI: `apps/web/app/(dashboard)/documents/page.tsx` (placeholder only — Stage 5/6 will flesh out).
- Status-chip mapping that needs the hyphen/underscore fix: `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx:14–22`.
- Existing CHECK constraint with the conflicting `'no-show'` value: `supabase/migrations/002_core_tables.sql:97`.

---

## 5. Conflicts between existing stage docs / code and the blocker contracts

Two layers checked: (A) the nine `stage-*.md` planning docs against the blocker contracts, and (B) the actual code already on disk.

### A. Stage doc conflicts — almost none

| Stage | Conflict | Severity |
|---|---|---|
| 1 | Migration spec (§2.1) matches blocker §3.6 and Blocker 1 exactly. Status `no_show` used in EXCLUDE WHERE clause. | ✅ none |
| 2 | `transition_appointment` is explicitly called out as **also exposed as a Supabase RPC** (Stage 2 §9, ~line 425). Status colors object (§4.3) uses `no_show`. | ✅ none |
| 3 | Reminder trigger (§2.2) uses `no_show`. | ✅ none |
| 4 | `generate-pdf` / `embed-signature` params (§4.1) and storage paths (§3.2) match blocker §3.4 + §3.5 verbatim. | ✅ none |
| 5 | No new contracts; reuses Stage 4. | ✅ none |
| 6 | Calls `embed-signature` with the contracted params. | ✅ none |
| 7 | Doc text uses informal label `damage` in two spots (the photo-grid example ~line 181 and the acceptance line ~line 273) where the canonical tag per §3.2 is `close_up_damage`. The Dart code blocks in the same file use `close_up_damage` correctly — so it's a doc-only inconsistency. | ⚠️ doc nit |
| 8 | References Stage 4 functions correctly. | ✅ none |
| 9 | Datasource serializes `kind.name` as `'busy' | 'available_extra'`, working_hours JSON mirrors Stage 1. | ✅ none |

**Action:** in `stage-7-mobile-inspection.md` replace the two `damage` references with `close_up_damage`. Nothing else in the stage docs contradicts the blocker contracts.

### B. Existing-code conflicts — one real one, in 6 files

The only contract the current codebase actively violates is **§3.1 status spelling**. The DB and every UI surface use `'no-show'` (hyphen); the blocker / RPC contract / every stage doc use `no_show` (underscore).

Occurrences to fix as part of Blocker 1's migration:

| File:line | Current | Must become |
|---|---|---|
| `supabase/migrations/002_core_tables.sql:97` | CHECK `... 'no-show' ...` | `'no_show'` — plus a data migration: `UPDATE appointments SET status='no_show' WHERE status='no-show'` |
| `apps/web/lib/queries/dashboard-metrics.ts:345` | `.eq("status", "no-show")` | `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-table.tsx:38` | `"no-show":` chip key | `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx:20` | `"no-show":` chip key | `"no_show"` |
| `apps/web/app/(dashboard)/upcoming-appointments.tsx:15` | `"no-show":` chip key | `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-filters.tsx:30` | `{ value: "no-show", label: "No show" }` | `value: "no_show"` |

Because the DB CHECK constraint will reject the new value until the migration lands, ship the SQL and the TS edits in the same PR.

**Soft conflict — status color palette (§3.1).** The existing chip maps use Tailwind classes (`amber`, `blue`, `emerald`, `gray`, `red`, `purple`) rather than the exact hexes the blocker locked (`#9CA3AF / #2563EB / #16A34A / #DC2626 / #EA580C / #7C3AED`). Two notable semantic differences:

- `pending` → current code uses amber; blocker §3.1 says gray `#9CA3AF`.
- The other states map roughly to the same hue family, but the precise hexes differ.

This isn't a runtime conflict — it's a brand-consistency call. Web and mobile only need to agree if you care about pixel-matching across platforms. Recommend creating `apps/web/lib/constants/appointment-status.ts` with the exact hexes from §3.1 and having both `appointment-table.tsx`, `appointment-calendar.tsx`, and `upcoming-appointments.tsx` import from there — mirroring the mobile-side `apps/mobile/lib/core/constants/appointment_status.dart` the blocker doc proposes.

**Non-conflicts worth noting:**

- `appointments.scheduled_at` (currently used everywhere) is **kept** by Stage 1; the new `scheduled_range tstzrange` is a GENERATED column on top. Additive, not breaking.
- `appointment-calendar.tsx:17` defines a `scheduled` key in the chip map. `scheduled` isn't in the contract enum — it's probably a leftover from when `prospects.status='scheduled'` got conflated with appointment status. Safe to delete; no DB row will ever have `appointments.status='scheduled'`.
- Mobile M5 feature folders (`apps/mobile/lib/features/appointments|inspection|documents`) are empty `.gitkeep` scaffolding — no conflicts on the mobile side.

---

## 6. Cross-references

- Blocker source of truth: [web-dependencies-for-mobile.md](web-dependencies-for-mobile.md)
- Full M5 plan: [README.md](README.md)
- Stage docs: `stage-1-appointment-scheduler.md`, `stage-2-calendar-and-status.md`, `stage-4-pdf-generation.md`, `stage-7-mobile-inspection.md`, `stage-9-mobile-availability-calendar.md`.
