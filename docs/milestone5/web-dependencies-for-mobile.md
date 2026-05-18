# M5 — Web dependencies that unblock mobile

**Audience:** the web developer working M5.
**Purpose:** a punch list of the web-side work the mobile build is waiting on, in priority order, with the contract shapes we need to lock together before either of us codes.

The full M5 plan is in [README.md](README.md). This doc is the **handoff slice** — only the parts where web work blocks mobile work.

---

## TL;DR

Mobile can start today on **UI shells + BLoCs + the SyncWorker + Calendar layout** using stubbed datasources. To go from "UI built" → "end-to-end working," I need **five** things from the web side, in roughly this order:

1. **Stage 1 migration merged** — appointments schema additions + `rufero_availability_blocks` table + `users.working_hours` column (1 day) → unblocks mobile Calendar (Stage 9), List view, and inspection writes.
2. **`transition_appointment` exposed as a Supabase RPC**, not a Next.js server action (½ day, can land with Stage 2) → unblocks mobile status changes.
3. **Stage 7 mobile-tables migration** (`photos` + `inspection_reports` columns) merged (½ day) → unblocks mobile inspection writes.
4. **Stage 4 Edge Functions deployed to dev** (`generate-pdf`, `embed-signature`) (2 days) → unblocks mobile Stage 8 end-to-end test.
5. **Realtime enabled on `rufero_availability_blocks`** (5 min — Supabase dashboard toggle) → so admin "Block rufero time" actions appear on the rufero's mobile Calendar instantly.

Plus **6 contract decisions** we need to lock in a 15-min conversation **before** either of us writes the related code (see §3 below). Pushing those decisions to "later" is what causes silent web/mobile collisions.

---

## 1. Blockers — priority order

### Blocker 1 — Stage 1 migration (BLOCKS my Stage 7 inspection writes AND Stage 9 Calendar)

**What I need merged:**

```sql
-- appointments additions
ALTER TABLE appointments
  ADD COLUMN scheduled_range tstzrange GENERATED ALWAYS AS (...) STORED;
CREATE INDEX appointments_scheduled_range_gist ON appointments USING gist (rufero_id, scheduled_range);
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist (...) WHERE (status IN ('pending', 'confirmed'));

-- users
ALTER TABLE users
  ADD COLUMN home_base_coords point,
  ADD COLUMN home_base_address text,
  ADD COLUMN working_hours jsonb;                        -- NEW: per-rufero override of tenant hours

-- tenants
ALTER TABLE tenants
  ADD COLUMN working_hours jsonb DEFAULT '{...}';

-- NEW table — rufero availability blocks (busy + available_extra)
CREATE TABLE rufero_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rufero_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  kind text NOT NULL CHECK (kind IN ('busy', 'available_extra')),
  reason text,                                          -- 'sick','pto','office','personal','other'
  notes text,
  recurrence_rule text,                                 -- iCal RRULE
  recurrence_parent_id uuid REFERENCES rufero_availability_blocks(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  block_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  CONSTRAINT ends_after_starts CHECK (ends_at > starts_at)
);
CREATE INDEX rufero_blocks_rufero_range_gist ON rufero_availability_blocks USING gist (rufero_id, block_range);
ALTER TABLE rufero_availability_blocks
  ADD CONSTRAINT availability_blocks_no_overlap
  EXCLUDE USING gist (rufero_id WITH =, block_range WITH &&)
  WHERE (kind = 'busy');
ALTER TABLE rufero_availability_blocks ENABLE ROW LEVEL SECURITY;
-- (full RLS policies in stage-1 §2.1)

-- RPCs — updated to consult blocks + per-rufero hours
CREATE OR REPLACE FUNCTION can_schedule(...);              -- now checks rufero_availability_blocks + users.working_hours
CREATE OR REPLACE FUNCTION suggest_rufero_for_prospect(...);
```

Full spec: [stage-1-appointment-scheduler.md §2](stage-1-appointment-scheduler.md#2-database-changes).

**Why it blocks me:**
- My mobile **Calendar page (Stage 9)** reads from `rufero_availability_blocks` and writes to it from the block editor. Without the table, the whole feature stubs.
- My **personal working hours page** (Stage 9 §9) writes to `users.working_hours`.
- My Stage 7 inspection flow writes to `inspection_reports` / `photos` (see Blocker 3).
- I want to be writing against the real schema, not a stub, so BLoC tests actually exercise the row shape that ships.

**ETA target:** end of this week. Anything later pushes Stages 7 and 9 too.

---

### Blocker 2 — `transition_appointment` must be a Supabase RPC, not a server action

**Why:** the M5 plan ([stage-2 §5.3](stage-2-calendar-and-status.md#53-server-action-shape)) describes `transitionAppointment` as a Next.js server action. **I can't call Next.js server actions from Flutter.** Same logic needs to live in a Supabase RPC the mobile client can hit:

```sql
CREATE OR REPLACE FUNCTION transition_appointment(
  p_appointment_id uuid,
  p_to text,                     -- 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'rescheduled'
  p_reason text DEFAULT NULL
) RETURNS jsonb               -- { ok: bool, error?: { code, message } }
```

The RPC:
- Checks the caller's role via `auth.uid()` + the transition matrix.
- Validates `reason` is non-empty when `to IN ('cancelled', 'no_show')`.
- Updates `appointments.status` (+ `cancellation_reason`).
- Updates `prospects.status` if the transition warrants (see [stage-2 §3](stage-2-calendar-and-status.md#3-allowed-status-transitions) side-effects column).

Your Next.js server action can simply call this RPC instead of writing the same logic twice. Both web and mobile end up on the same code path → no drift.

**Why it blocks me:** mobile Stage 2 ships "Mark complete" / "No-show" buttons. Without the RPC, the buttons don't work.

**ETA target:** with Stage 2.

---

### Blocker 3 — Stage 7 mobile-tables migration (BLOCKS my inspection writes)

The mobile inspection flow writes to `inspection_reports` (existing) + `photos` (new). The migration adding the new columns + the new `photos` table is in [stage-7 §2](stage-7-mobile-inspection.md#2-database-changes). Who owns it?

**Suggestion:** you own it. Reasons:
- It's pure SQL — no Flutter context needed.
- It ships in the same migration sweep as Stage 1 / Stage 4 changes — keeps DB migrations bundled.
- I can't apply migrations locally without the web setup anyway.

What I need:

```sql
ALTER TABLE inspection_reports
  ADD COLUMN roof_age_years int,
  ADD COLUMN roof_material text,
  ADD COLUMN storm_date date,
  ADD COLUMN affected_areas text[],
  ADD COLUMN severity int CHECK (severity BETWEEN 1 AND 5),
  ADD COLUMN scope_notes text,
  ADD COLUMN photo_count_expected int DEFAULT 0,
  ADD COLUMN completed_at timestamptz;

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES inspection_reports(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  tags text[] NOT NULL,
  gps_lat double precision,
  gps_lng double precision,
  taken_at timestamptz NOT NULL,
  uploaded_at timestamptz,
  width_px int,
  height_px int,
  file_size_bytes int,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX photos_inspection_idx ON photos (inspection_id);
CREATE INDEX photos_prospect_idx ON photos (prospect_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY photos_select_tenant ON photos FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY photos_insert_tenant ON photos FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
```

Full spec: [stage-7 §2](stage-7-mobile-inspection.md#2-database-changes).

**Why it blocks me:** Stage 7 photo + form writes 400 without these tables.

**ETA target:** can bundle with Blocker 1.

---

### Blocker 4 — Stage 4 Edge Functions deployed to dev

`generate-pdf` and `embed-signature`. Full spec: [stage-4-pdf-generation.md](stage-4-pdf-generation.md).

**Why it blocks me:** mobile Stage 8's offline sync worker calls both functions when the queue drains. I can build the queue logic against stubs, but I can't validate the full happy-path-through-offline-back-to-online flow until the functions are live on dev.

**Note:** I can ship Stage 8 with the Edge Function calls stubbed for the demo, then wire them up in a follow-up PR. Not a hard blocker, but the longer this drags, the higher the risk that the contract drifts.

**ETA target:** before end of M5 week (Stage 8 is the last mobile stage anyway).

---

### Blocker 5 — Realtime enabled on `rufero_availability_blocks` (5 min)

**What I need:** the new `rufero_availability_blocks` table needs Supabase Realtime enabled (Dashboard → Database → Replication → toggle "Realtime" on for the table). It's a literal checkbox.

**Why:** when an admin uses Stage 2's "Block rufero time" action on the web (e.g., "Carlos is out sick today"), Carlos's mobile Calendar page should see the block appear within 2 seconds. Without realtime, Carlos would have to pull-to-refresh manually.

**ETA target:** same day the table is created (Blocker 1).

---

## 2. NOT blocking — you can do these whenever

These ship to web only; mobile doesn't touch them and doesn't wait on them:

- `/appointments` calendar page with FullCalendar (incl. background-event rendering for availability blocks)
- Appointment side drawer + reschedule modal + **Block rufero time** admin action
- Admin "Working hours" editor in `/admin/users/[id]` (writes `users.working_hours`)
- `/documents` page (web index)
- New Document modal
- Signing page (`/documents/[id]/sign`) with `react-signature-canvas` + PDF.js preview
- Stage 3 appointment-reminder Edge Function (pure server)
- SendGrid auto-email of signed PDF

Build these in whatever order works for you. The only request: make sure the **"Block rufero time"** action writes to `rufero_availability_blocks` with the exact JSON shape locked in §3.6 — otherwise mobile + web disagree on what a "block" is.

---

## 3. Contract decisions to lock TODAY (15-min conversation)

If we don't agree on these 5 shapes now, we **will** clobber each other during integration. Each takes <2 min to decide; I just need a yes from you.

### 3.1 Appointment status colors + labels

I'll create `apps/mobile/lib/core/constants/appointment_status.dart` with these values — confirm web matches in `apps/web/lib/constants/appointment-status.ts`:

| Status DB value | Hex | Label |
|---|---|---|
| `pending` | `#9CA3AF` | Pending |
| `confirmed` | `#2563EB` | Confirmed |
| `completed` | `#16A34A` | Completed |
| `cancelled` | `#DC2626` | Cancelled |
| `no_show` | `#EA580C` | No-show |
| `rescheduled` | `#7C3AED` | Rescheduled |

(These are the values from [README §6 / stage-2 §4.3](stage-2-calendar-and-status.md#43-component-skeleton). Confirm or propose changes.)

### 3.2 Photo tags — canonical list (Stage 7)

```
overview, front, back, left_side, right_side,
close_up_damage, gutters, chimney, skylights, hvac, siding,
evidence, other
```

Mobile is the source of truth (you'll only consume these in M7+ filters). Confirm the list is fine.

### 3.3 `transition_appointment` RPC shape

```ts
// Call
supabase.rpc('transition_appointment', {
  p_appointment_id: '<uuid>',
  p_to: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'rescheduled',
  p_reason: 'optional string, required when to is cancelled/no_show',
});

// Returns jsonb
{ ok: true }                                // happy path
{ ok: false, error: { code: 'forbidden', message: '...' } }
{ ok: false, error: { code: 'reason_required', message: '...' } }
{ ok: false, error: { code: 'invalid_transition', message: '...' } }
```

Confirm or propose changes before either of us codes.

### 3.4 `generate-pdf` + `embed-signature` JSON

Locked in [stage-4 §4.1 + §5.1](stage-4-pdf-generation.md#41-contract). Just read those two sections so we both agree on field names. If you want to change anything, tell me now — once I'm writing the offline queue against them, every shape change costs me 30+ min to retrofit.

Key points:
- `generate-pdf` accepts `prospect_id`, `template_kind`, optional `fields` object.
- `embed-signature` accepts `document_id`, `signature_png_base64`, `signer_name`, `device_metadata`.
- Both return `{ document: {...} }` / `{ signed_document: {...} }` with the new row.

### 3.5 Storage paths

```
inspection-photos/{tenant_id}/inspections/{inspection_id}/{photo_id}.jpg
documents/{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf
documents/{tenant_id}/documents/{prospect_id}/{doc_id}-signed.pdf
signatures/{tenant_id}/{document_id}.png
```

I'll construct these client-side for direct downloads (signed URLs). Confirm web uses exactly these in `generate-pdf` / `embed-signature` Storage writes.

### 3.6 `rufero_availability_blocks` row shape

Both web (Stage 2's "Block rufero time") and mobile (Stage 9's block editor) write to this table. Same column names, same JSON for reasons + recurrence. Confirm:

```jsonc
{
  "id": "uuid",
  "tenant_id": "uuid",
  "rufero_id": "uuid",
  "starts_at": "2026-05-14T12:00:00Z",
  "ends_at":   "2026-05-14T13:00:00Z",
  "all_day": false,
  "kind": "busy",                              // 'busy' | 'available_extra'
  "reason": "sick",                            // 'sick' | 'pto' | 'office' | 'personal' | 'other'
  "notes": "optional free text",
  "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",  // null for non-recurring
  "recurrence_parent_id": null,
  "created_by": "uuid (the user who created the block)",
  "created_at": "timestamptz"
}
```

**Recurrence presets (M5 ships these 3):**
| Label | RRULE |
|-------|-------|
| Does not repeat | `null` |
| Every weekday | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Weekly on {day} | `FREQ=WEEKLY;BYDAY={day-code}` (MO/TU/WE/TH/FR/SA/SU) |

Both clients must support **rendering** any RRULE that comes back from the DB (web admin in M7+ may add custom rules). For M5 we only **write** these 3 patterns.

`users.working_hours` JSON shape (same as `tenants.working_hours`):

```jsonc
{
  "mon": { "start": "08:00", "end": "17:00" },
  "tue": { "start": "08:00", "end": "17:00" },
  "wed": null,                          // null = day off
  "thu": { "start": "08:00", "end": "17:00" },
  "fri": { "start": "08:00", "end": "14:00" },
  "sat": null,
  "sun": null
}
```

A NULL on the column itself (not the day key) means "inherit from `tenants.working_hours`."

---

## 4. Suggested execution order (yours)

If you ship in this order, you maximize my parallel velocity:

| Day | Web work | Unblocks mobile |
|-----|----------|-----------------|
| 1   | Lock the 6 contracts (this doc, §3) | Mobile constants files + Stage 9 block-row model |
| 1–2 | Stage 1 migration + RPCs + Stage 7 tables migration + `rufero_availability_blocks` realtime toggle (bundle) | Mobile Stages 7 + 9 real datasources |
| 2   | `transition_appointment` RPC | Mobile List-tab status actions (Mark complete / No-show) |
| 3–5 | Stage 4 Edge Functions deployed to dev | Mobile Stage 8 end-to-end |
| 3–7 | Web Stages 2, 5, 6 (calendar / documents / signing) — pure web | (no mobile dependency) |
| 4–6 | Web Stage 2's "Block rufero time" admin action | Verifies mobile Calendar realtime: admin blocks → rufero sees within 2s |

I'll be running Mobile Stages 7 + 9 in parallel with your Web Stage 2. Stage 8 starts when Stage 4 lands. Stage 9 builds entirely against stubs in parallel with Blocker 1 (so the moment your migration lands, I can swap stubs → real Supabase calls in ~½ day).

---

## 5. Where to find more detail

- Full M5 plan: [README.md](README.md)
- Stage docs cited above, each ~10–15 KB, with acceptance criteria + pitfalls.

Ping me when each blocker lands and I'll swap the corresponding mobile stub for the real call. Most should be <½ day swaps once the contract is locked.
