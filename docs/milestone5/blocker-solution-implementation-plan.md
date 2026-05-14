# M5 — Blocker Solution Implementation Plan

**Audience:** the web developer who will land the 5 mobile blockers.
**Companion docs:** [web-dependencies-for-mobile.md](web-dependencies-for-mobile.md) (the contracts), [mobile-blocker-solution.md](mobile-blocker-solution.md) (the audit).

This plan turns the audit into PR-sized, sequenced work. Each step lists files to touch, exact SQL/code to write, and an acceptance check. The goal is to unblock mobile in ≤ one working week.

---

## 0. Conventions used in this plan

- **Migration numbering:** next free is `025_…`. Use four-digit sequences (`025_*`, `026_*`, …) consistent with the existing folder.
- **Tenant/role helpers:** the project uses `public.get_tenant_id()` and `public.get_user_role()` (see `006_rls.sql`). The blocker doc's RLS snippets say `current_tenant_id()` — translate as you copy.
- **Status spelling:** all new code uses `no_show` (underscore). The hyphen variants in existing code are migrated to underscore in Step 1.
- **Branches / PRs:** one PR per step below unless noted. Keep PRs small enough to revert independently.
- **Definition of done per step:** acceptance check passes locally, types regenerated, mobile counterpart can swap its stub.

---

## Step 1 — Status spelling cleanup + Stage 1 / Stage 7 schema

**Goal:** unblock Mobile Stages 7 + 9 by landing the schema, and resolve the `no-show`/`no_show` conflict in the same commit so the CHECK constraint doesn't reject the renamed value.

**Branch:** `feat/m5-step-1-schema`
**Migration:** `supabase/migrations/025_m5_appointments_and_availability.sql`

### 1.1 SQL — single migration file, in this order

1. **Drop and recreate the `appointments.status` CHECK** with the underscored set, and backfill data:
   ```sql
   UPDATE appointments SET status = 'no_show' WHERE status = 'no-show';
   ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
   ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
     CHECK (status IN ('pending','confirmed','completed','cancelled','no_show','rescheduled'));
   ```
2. **`appointments` additions** (per blocker §1 / stage-1 §2.1):
   - `scheduled_range tstzrange GENERATED ALWAYS AS (tstzrange(scheduled_at, scheduled_at + (duration_minutes||' minutes')::interval, '[)')) STORED`
   - `CREATE INDEX appointments_scheduled_range_gist ON appointments USING gist (rufero_id, scheduled_range);`
   - `ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist (rufero_id WITH =, scheduled_range WITH &&) WHERE (status IN ('pending','confirmed'));`
3. **`users` additions:** `home_base_address text`, `working_hours jsonb`. (`home_base_coords` already exists.)
4. **`tenants` additions:** `working_hours jsonb DEFAULT '{"mon":{"start":"08:00","end":"17:00"},"tue":{"start":"08:00","end":"17:00"},"wed":{"start":"08:00","end":"17:00"},"thu":{"start":"08:00","end":"17:00"},"fri":{"start":"08:00","end":"17:00"},"sat":null,"sun":null}'::jsonb`.
5. **`rufero_availability_blocks` table** (copy the DDL from blocker §1 lines 48–69 verbatim). Use `public.get_tenant_id()` in the RLS policies — adapt from `006_rls.sql`:
   ```sql
   CREATE POLICY rab_select ON rufero_availability_blocks FOR SELECT
     USING (tenant_id = public.get_tenant_id());
   CREATE POLICY rab_insert ON rufero_availability_blocks FOR INSERT
     WITH CHECK (
       tenant_id = public.get_tenant_id()
       AND (
         public.get_user_role() IN ('admin','owner','super_admin')
         OR rufero_id = auth.uid()
       )
     );
   CREATE POLICY rab_update ON rufero_availability_blocks FOR UPDATE
     USING (
       tenant_id = public.get_tenant_id()
       AND (public.get_user_role() IN ('admin','owner','super_admin') OR rufero_id = auth.uid())
     );
   CREATE POLICY rab_delete ON rufero_availability_blocks FOR DELETE
     USING (
       tenant_id = public.get_tenant_id()
       AND (public.get_user_role() IN ('admin','owner','super_admin') OR rufero_id = auth.uid())
     );
   ```
6. **`inspection_reports` column adds** (stage-7 §2): `roof_age_years int`, `roof_material text`, `storm_date date`, `affected_areas text[]`, `severity int CHECK (severity BETWEEN 1 AND 5)`, `scope_notes text`, `photo_count_expected int DEFAULT 0`, `completed_at timestamptz`.
7. **`photos` table + indexes + RLS** (stage-7 §2 / blocker §1 lines 138–162). Same `public.get_tenant_id()` substitution.
8. **`can_schedule` RPC** — per stage-1 §2.2. Must consult `rufero_availability_blocks` (any overlapping `kind='busy'` block returns false) and resolve `users.working_hours` with fallback to `tenants.working_hours`.
9. **`suggest_rufero_for_prospect` RPC** — per stage-1 §2.3.

### 1.2 Realtime publication

Append to `supabase/migrations/007_enable_realtime.sql` (idempotent block, same pattern as `prospects`):
```sql
if not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='rufero_availability_blocks'
) then alter publication supabase_realtime add table public.rufero_availability_blocks; end if;
```
Also consider adding `appointments` here for Stage 2 live updates — single line, low cost.

### 1.3 Web code edits (same PR — DB CHECK forces the rename)

| File | Edit |
|---|---|
| `apps/web/lib/queries/dashboard-metrics.ts:345` | `"no-show"` → `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-table.tsx:38` | chip key `"no-show"` → `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx:20` | chip key `"no-show"` → `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx:17` | delete the stray `scheduled` key (dead code) |
| `apps/web/app/(dashboard)/upcoming-appointments.tsx:15` | chip key `"no-show"` → `"no_show"` |
| `apps/web/app/(dashboard)/appointments/appointment-filters.tsx:30` | `value: "no-show"` → `value: "no_show"` |

Regenerate `apps/web/lib/supabase/database.types.ts` (`supabase gen types …`) and commit.

### 1.4 Acceptance check

- `pnpm --filter web typecheck && pnpm --filter web build` passes.
- `select * from rufero_availability_blocks limit 0` in psql succeeds.
- `select can_schedule(...)` returns boolean against seed data.
- An admin can `INSERT INTO rufero_availability_blocks ...` from the Supabase SQL editor under an admin session and a rufero cannot insert for another rufero.
- No grep hit for `'no-show'` / `"no-show"` anywhere outside docs.

**Unblocks:** Mobile Stages 7 + 9 datasources, Web Stage 2 status chip work, Web "Block rufero time" admin action.

---

## Step 2 — `transition_appointment` RPC

**Goal:** one code path for status transitions used by web Stage 2 AND mobile.

**Branch:** `feat/m5-step-2-transition-rpc`
**Migration:** `supabase/migrations/026_transition_appointment_rpc.sql`

### 2.1 SQL

```sql
CREATE OR REPLACE FUNCTION transition_appointment(
  p_appointment_id uuid,
  p_to text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_user_role();
  v_uid  uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_allowed boolean;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Appointment not found'));
  END IF;

  -- Tenant guard
  IF v_appt.tenant_id <> public.get_tenant_id() THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Cross-tenant access denied'));
  END IF;

  -- Role/ownership: rufero can only act on their own appointments
  IF v_role = 'rufero' AND v_appt.rufero_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Not your appointment'));
  END IF;

  -- Transition matrix — see stage-2 §3 for source of truth
  v_allowed := CASE
    WHEN v_appt.status = 'pending'   AND p_to IN ('confirmed','cancelled','rescheduled') THEN true
    WHEN v_appt.status = 'confirmed' AND p_to IN ('completed','no_show','cancelled','rescheduled') THEN true
    ELSE false
  END;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_transition',
        'message', format('Cannot move %s → %s', v_appt.status, p_to)));
  END IF;

  IF p_to IN ('cancelled','no_show') AND coalesce(btrim(p_reason),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','reason_required','message','Reason required'));
  END IF;

  UPDATE appointments
     SET status = p_to,
         cancellation_reason = CASE WHEN p_to IN ('cancelled','no_show') THEN p_reason ELSE cancellation_reason END,
         updated_at = now()
   WHERE id = p_appointment_id;

  -- Prospect cascade — see stage-2 §3 "side effects"
  IF p_to = 'completed' THEN
    UPDATE prospects SET status = 'inspected' WHERE id = v_appt.prospect_id AND status = 'scheduled';
  ELSIF p_to = 'cancelled' THEN
    UPDATE prospects SET status = 'contacted' WHERE id = v_appt.prospect_id AND status = 'scheduled';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION transition_appointment(uuid,text,text) TO authenticated;
```

> Pull the exact transition matrix + side-effect rows from `stage-2-calendar-and-status.md §3` before merging — the snippet above is a starting point, not authoritative.

### 2.2 Web wiring

- New server action `apps/web/app/(dashboard)/appointments/actions.ts → transitionAppointment(input)` that just calls `supabase.rpc('transition_appointment', { ... })` and unwraps the `{ ok, error }` envelope into a thrown `Error` with `error.code` on the message. Keep `assignAppointmentRufero` untouched.
- Build the Stage 2 UI buttons (Confirm / Cancel / Mark complete / No-show / Reschedule) against this single function.

### 2.3 Acceptance

- `select transition_appointment('<id>','confirmed',null)` from a confirmed appt returns `{"ok":false,"error":{"code":"invalid_transition"...}}`.
- Cancel without reason returns `reason_required`.
- Rufero session can transition own appt; cannot transition another rufero's.
- Web UI button calls the RPC and refreshes the list (`revalidatePath('/appointments')`).

**Unblocks:** Mobile list-tab status actions.

---

## Step 3 — Shared appointment-status constants

**Goal:** Decision §3.1 colors locked across web and mobile.

**Branch:** can fold into Step 1 or land standalone.
**New file:** `apps/web/lib/constants/appointment-status.ts`

```ts
export const APPOINTMENT_STATUSES = [
  'pending','confirmed','completed','cancelled','no_show','rescheduled',
] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending:    '#9CA3AF',
  confirmed:  '#2563EB',
  completed:  '#16A34A',
  cancelled:  '#DC2626',
  no_show:    '#EA580C',
  rescheduled:'#7C3AED',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending:'Pending', confirmed:'Confirmed', completed:'Completed',
  cancelled:'Cancelled', no_show:'No-show', rescheduled:'Rescheduled',
};
```

Refactor `appointment-table.tsx`, `appointment-calendar.tsx`, `upcoming-appointments.tsx`, `appointment-filters.tsx` to import from here. Mobile creates the matching `apps/mobile/lib/core/constants/appointment_status.dart` with identical hex values.

### Acceptance
- No literal status hex / label strings left in those four files.
- `grep -r "no-show" apps/web supabase` returns zero hits.

---

## Step 4 — Stage 4 Edge Functions: `generate-pdf` + `embed-signature`

**Goal:** unblock Mobile Stage 8 offline sync worker end-to-end test.

**Branch:** `feat/m5-step-4-edge-functions`
**New folders:** `supabase/functions/generate-pdf/` and `supabase/functions/embed-signature/` (mirror `provision-tenant/`).

### 4.1 `generate-pdf/index.ts`

- Auth: validate Supabase JWT from `Authorization: Bearer …` header; reject if missing.
- Body: `{ prospect_id: string, template_kind: '3rd_party_auth'|'acv_contract'|'rcv_contract'|'supplement', fields?: object }`.
- Tenant: derive from the authenticated user.
- Render PDF (pdf-lib or @react-pdf/renderer; pick what Stage 4 doc specifies). Save to Storage path **exactly** `documents/{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf`.
- INSERT into `documents` (existing table at `002_core_tables.sql:108`). Return `{ document: { id, storage_path, status: 'generated', … } }`.

### 4.2 `embed-signature/index.ts`

- Body: `{ document_id: string, signature_png_base64: string, signer_name: string, device_metadata: object }`.
- Fetch unsigned PDF from storage, overlay signature PNG (pdf-lib), write `documents/{tenant_id}/documents/{prospect_id}/{doc_id}-signed.pdf`.
- Write the raw PNG to `signatures/{tenant_id}/{document_id}.png`.
- Update `documents.status='signed'`, set `signed_at`, return `{ signed_document: {...} }`.

Both functions: use the existing `_shared/supabase-admin.ts` pattern for service-role client. Add `_shared/auth.ts` if a JWT-validation helper doesn't exist yet (single small utility).

### 4.3 Deploy to dev

```
supabase functions deploy generate-pdf
supabase functions deploy embed-signature
```

### 4.4 Acceptance

- `curl` with a valid JWT returns a non-empty `document.storage_path` for `generate-pdf`.
- A second call to `embed-signature` produces a signed PDF and the `documents` row flips to `status='signed'`.
- Storage objects appear at the §3.5 paths exactly.

**Unblocks:** Mobile Stage 8 sync worker (can still ship stubbed if this lags, but contract drift risk grows).

---

## Step 5 — Stage-doc cleanup

**Goal:** remove the only doc-level inconsistency the audit flagged.

**Branch:** `docs/m5-stage7-tag-fix`
**File:** `docs/milestone5/stage-7-mobile-inspection.md`

- ~line 181 (photo-grid example): `damage` → `close_up_damage`.
- ~line 273 (acceptance text): "at least one tagged `damage`" → "at least one tagged `close_up_damage`".

No code change. ≤5 min PR.

---

## Sequencing & ownership

| Day | PR | Depends on | Unblocks |
|-----|----|------------|----------|
| 1 | Step 1 (schema + status rename) | — | Mobile Stages 7 & 9, Web Stage 2 chips |
| 1 | Step 5 (stage-7 doc nit) | — | nothing (cosmetic) |
| 2 | Step 2 (`transition_appointment` RPC) | Step 1 | Mobile list-tab status buttons |
| 2 | Step 3 (status constants module) | Step 1 | mobile/web color parity |
| 3–5 | Step 4 (Edge Functions) | Step 1 (documents table already exists, but storage paths assume tenant ids) | Mobile Stage 8 end-to-end |

Steps 1–3 are the hard blockers; Step 4 can ship later in the week without halting mobile (they have stubs). Step 5 is independent.

---

## Risk callouts

- **EXCLUDE constraint backfill.** Adding `appointments_no_overlap` against an existing `appointments` table will fail if any seed/dev rows currently overlap. Run the constraint with `NOT VALID` first, fix offenders, then `VALIDATE CONSTRAINT` — or just clean the seed data before the migration.
- **`scheduled_range` GENERATED column.** Postgres requires the expression to be `IMMUTABLE`. `tstzrange(scheduled_at, scheduled_at + interval ...)` is immutable; casting via `(duration_minutes||' minutes')::interval` is also OK. Sanity-check on a clone first.
- **`SECURITY DEFINER` on the RPC.** Make sure `search_path = public` is set (the snippet does this) — otherwise a malicious schema-resolution path can escalate.
- **Storage bucket existence.** The Edge Functions assume `documents` and `signatures` buckets exist. Create them (private, signed-URL access) in the same migration step or as a one-liner in `supabase/config.toml`/dashboard before deploying functions.
- **Realtime + RLS.** Realtime respects RLS but only when policies are present at publication time. Verify a rufero subscribing to `rufero_availability_blocks` only sees their own + tenant admins' blocks.

---

## Where to look during implementation

- Migration patterns: `supabase/migrations/002_core_tables.sql`, `006_rls.sql`, `007_enable_realtime.sql`.
- Helper functions: `supabase/migrations/004_helper_functions.sql` (uses `public.get_tenant_id()`, `public.get_user_role()`).
- Edge Function template: `supabase/functions/provision-tenant/index.ts` + `supabase/functions/_shared/*`.
- Server-action style for web: `apps/web/app/(dashboard)/appointments/actions.ts`.
- Stage source-of-truth specs: `stage-1-…md`, `stage-2-…md`, `stage-4-…md`, `stage-7-…md`, `stage-9-…md`.
