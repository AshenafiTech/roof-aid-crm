# M5 — Web dependencies that unblock mobile

**Audience:** the web developer working M5.
**Purpose:** a punch list of the web-side work the mobile build is waiting on, in priority order, with the contract shapes we need to lock together before either of us codes.

The full M5 plan is in [README.md](README.md). This doc is the **handoff slice** — only the parts where web work blocks mobile work.

---

## TL;DR

Mobile can start today on **UI shells + BLoCs + the SyncWorker** using stubbed datasources. To go from "UI built" → "end-to-end working," I need four things from the web side, in roughly this order:

1. **Stage 1 migration merged** — appointments schema additions (1 day) → unblocks mobile My Schedule + inspection writes.
2. **`transition_appointment` exposed as a Supabase RPC**, not a Next.js server action (½ day, can land with Stage 2) → unblocks mobile status changes.
3. **Stage 7 mobile-tables migration** (`photos` + `inspection_reports` columns) merged (½ day) → unblocks mobile inspection writes.
4. **Stage 4 Edge Functions deployed to dev** (`generate-pdf`, `embed-signature`) (2 days) → unblocks mobile Stage 8 end-to-end test.

Plus **5 contract decisions** we need to lock in a 15-min conversation **before** either of us writes the related code (see §3 below). Pushing those decisions to "later" is what causes silent web/mobile collisions.

---

## 1. Blockers — priority order

### Blocker 1 — Stage 1 migration (BLOCKS my Stage 2 + 7)

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
  ADD COLUMN home_base_address text;

-- tenants
ALTER TABLE tenants
  ADD COLUMN working_hours jsonb DEFAULT '{...}';

-- RPCs
CREATE FUNCTION can_schedule(...);
CREATE FUNCTION suggest_rufero_for_prospect(...);
```

Full spec: [stage-1-appointment-scheduler.md §2](stage-1-appointment-scheduler.md#2-database-changes).

**Why it blocks me:** my mobile My Schedule page queries `appointments` via `.select()`. The new columns don't break the query — but I want to be writing against the real schema, not a stub, so my BLoC tests actually exercise the row shape that ships.

**ETA target:** end of this week. Anything later pushes Stage 7 too.

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

## 2. NOT blocking — you can do these whenever

These ship to web only; mobile doesn't touch them and doesn't wait on them:

- `/appointments` calendar page with FullCalendar
- Appointment side drawer + reschedule modal
- `/documents` page (web index)
- New Document modal
- Signing page (`/documents/[id]/sign`) with `react-signature-canvas` + PDF.js preview
- Stage 3 appointment-reminder Edge Function (pure server)
- SendGrid auto-email of signed PDF

Build these in whatever order works for you.

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

---

## 4. Suggested execution order (yours)

If you ship in this order, you maximize my parallel velocity:

| Day | Web work | Unblocks mobile |
|-----|----------|-----------------|
| 1   | Lock the 5 contracts (this doc) | Mobile constants files |
| 1–2 | Stage 1 migration + RPCs + Stage 7 tables migration (bundle) | Mobile Stages 2 + 7 real datasources |
| 2   | `transition_appointment` RPC | Mobile Stage 2 status actions |
| 3–5 | Stage 4 Edge Functions deployed to dev | Mobile Stage 8 end-to-end |
| 3–7 | Web Stages 2, 5, 6 (calendar / documents / signing) — pure web | (no mobile dependency) |

I'll be running Mobile Stages 2 + 7 in parallel with your Web Stage 2. Stage 8 starts when Stage 4 lands.

---

## 5. Where to find more detail

- Full M5 plan: [README.md](README.md)
- Stage docs cited above, each ~10–15 KB, with acceptance criteria + pitfalls.

Ping me when each blocker lands and I'll swap the corresponding mobile stub for the real call. Most should be <½ day swaps once the contract is locked.
