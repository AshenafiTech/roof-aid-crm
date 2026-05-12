# Stage 1 — Appointment Scheduler

**Goal:** Telefonistas (and Admins/Owners) can book an inspection from any prospect card. The scheduler picks a date + time, assigns a rufero, refuses to double-book, and suggests the closest available rufero by default. On save, the appointment row exists, the prospect's status flips to `appointment_set`, and an `activities` row records who did what.

**Outcome:** A clean booking flow that's impossible to misuse — concurrent bookings can't both win, overlapping slots are rejected at the database, and the UI shows availability before the user wastes time on a doomed slot.

**Estimated time:** 1.5 days

---

## 1. Why this stage is first

Every other M5 stage consumes the appointment row shape this stage finalizes:

- **Stage 2** (calendar) reads from `appointments`.
- **Stage 3** (reminders) reads `scheduled_at` and `appointment_reminders`.
- **Stage 7** (mobile inspection) starts from an appointment row.
- **Stage 8** (offline sync) writes status changes back to the same table.

Get the schema right here once. Migrations after this stage are additive only.

---

## 2. Database changes

### 2.1 Migration: `0XX_m5_appointments.sql`

`appointments` already exists from M1 (per [supabase/migrations/002_core_tables.sql](../../supabase/migrations/002_core_tables.sql)). Stage 1 adds:

```sql
-- 1. Generated tstzrange for overlap checks (includes 120-min travel buffer).
ALTER TABLE appointments
  ADD COLUMN scheduled_range tstzrange
  GENERATED ALWAYS AS (
    tstzrange(
      scheduled_at,
      scheduled_at + ((duration_minutes + 120) * interval '1 minute'),
      '[)'
    )
  ) STORED;

-- 2. GiST index for fast overlap queries.
CREATE INDEX appointments_scheduled_range_gist
  ON appointments USING gist (rufero_id, scheduled_range);

-- 3. Exclude constraint — guarantees no two appointments overlap for the
-- same rufero, including the 120-min buffer.
-- Cancelled / no-show / rescheduled rows are excluded from the constraint
-- via a partial WHERE: they no longer hold the slot.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    rufero_id WITH =,
    scheduled_range WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

-- 4. ruferos need a home base for proximity suggestion.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_base_coords point,
  ADD COLUMN IF NOT EXISTS home_base_address text;

-- 5. Tenants get configurable working hours per day for ruferos.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{
    "mon": {"start": "08:00", "end": "18:00"},
    "tue": {"start": "08:00", "end": "18:00"},
    "wed": {"start": "08:00", "end": "18:00"},
    "thu": {"start": "08:00", "end": "18:00"},
    "fri": {"start": "08:00", "end": "18:00"},
    "sat": {"start": "09:00", "end": "14:00"},
    "sun": null
  }'::jsonb;
```

> The `EXCLUDE` constraint requires `btree_gist` — should already be enabled in `001_extensions.sql`. Verify before applying.

### 2.2 RPC: `can_schedule(rufero_id, slot_start, duration_minutes)`

```sql
CREATE OR REPLACE FUNCTION can_schedule(
  p_rufero_id uuid,
  p_slot_start timestamptz,
  p_duration_minutes int DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_tz text;
  v_working_hours jsonb;
  v_day_key text;
  v_day_window jsonb;
  v_local_time time;
  v_slot_end timestamptz;
  v_conflict_id uuid;
  v_rufero_active boolean;
BEGIN
  v_slot_end := p_slot_start + (p_duration_minutes * interval '1 minute');

  -- 1. Rufero exists, is active, role = rufero
  SELECT tenant_id, is_active INTO v_tenant_id, v_rufero_active
  FROM users
  WHERE id = p_rufero_id AND role = 'rufero';

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rufero_not_found');
  END IF;

  IF NOT v_rufero_active THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rufero_inactive');
  END IF;

  -- 2. Within tenant working hours (in tenant timezone)
  SELECT timezone, working_hours INTO v_tz, v_working_hours
  FROM tenants
  WHERE id = v_tenant_id;

  v_day_key := lower(to_char(p_slot_start AT TIME ZONE v_tz, 'dy'));
  v_day_window := v_working_hours->v_day_key;

  IF v_day_window IS NULL OR v_day_window = 'null'::jsonb THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_working_hours');
  END IF;

  v_local_time := (p_slot_start AT TIME ZONE v_tz)::time;

  IF v_local_time < (v_day_window->>'start')::time
     OR (v_slot_end AT TIME ZONE v_tz)::time > (v_day_window->>'end')::time THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_working_hours');
  END IF;

  -- 3. No overlapping appointment for this rufero (incl. 120-min buffer)
  SELECT id INTO v_conflict_id
  FROM appointments
  WHERE rufero_id = p_rufero_id
    AND status IN ('pending', 'confirmed')
    AND scheduled_range && tstzrange(
      p_slot_start,
      v_slot_end + interval '120 minutes',
      '[)'
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'overlap',
      'conflicting_appointment_id', v_conflict_id
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION can_schedule TO authenticated;
```

### 2.3 RPC: `suggest_rufero_for_prospect(prospect_id, slot_start, duration_minutes)`

Returns the closest available rufero, plus distance + working-hours fit.

```sql
CREATE OR REPLACE FUNCTION suggest_rufero_for_prospect(
  p_prospect_id uuid,
  p_slot_start timestamptz,
  p_duration_minutes int DEFAULT 60
) RETURNS TABLE (
  rufero_id uuid,
  display_name text,
  distance_miles numeric,
  can_schedule_result jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_prospect_coords point;
BEGIN
  SELECT tenant_id, coordinates INTO v_tenant_id, v_prospect_coords
  FROM prospects
  WHERE id = p_prospect_id;

  RETURN QUERY
  SELECT
    u.id,
    coalesce(u.first_name || ' ' || u.last_name, u.email),
    CASE
      WHEN u.home_base_coords IS NULL OR v_prospect_coords IS NULL THEN NULL
      ELSE (u.home_base_coords <-> v_prospect_coords) * 69.0  -- degrees → miles
    END::numeric,
    can_schedule(u.id, p_slot_start, p_duration_minutes)
  FROM users u
  WHERE u.tenant_id = v_tenant_id
    AND u.role = 'rufero'
    AND u.is_active
  ORDER BY 3 NULLS LAST;  -- distance asc, NULLs last
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_rufero_for_prospect TO authenticated;
```

> The `<->` distance operator on `point` returns degrees. `× 69.0` gives a rough miles approximation — good enough for "closest rufero" UX. M3's PostGIS proximity already exists for precise queries; we don't need it here.

### 2.4 RLS verification

`appointments` RLS already exists in [006_rls.sql](../../supabase/migrations/006_rls.sql) — tenant-scoped select/insert/update. Stage 1 doesn't change RLS; it just verifies the new columns don't bypass it. Test:

```sql
-- as a Tenant B user
SELECT can_schedule('<a-tenant-A-rufero-id>', now(), 60);
-- should return 'rufero_not_found' (RLS hides the row from the SECURITY DEFINER context)
```

Actually — `SECURITY DEFINER` runs as the function owner, which is normally `postgres`. To make the RPC tenant-aware, gate by `auth.uid()`:

```sql
-- inside can_schedule, before the rufero lookup:
IF v_tenant_id != (SELECT tenant_id FROM users WHERE id = auth.uid()) THEN
  RETURN jsonb_build_object('allowed', false, 'reason', 'forbidden');
END IF;
```

Add the same guard to `suggest_rufero_for_prospect`.

---

## 3. Web — scheduler modal

### 3.1 Route surface

The modal is launched from two entry points:

1. **Prospect card** ([apps/web/components/prospects/prospect-card.tsx](../../apps/web/components/prospects/prospect-card.tsx)) — the existing **Appt** action button.
2. **Prospect detail** — Appointments tab, **Schedule new** button.

Both push a query param (`?schedule=1`) so the modal is a real route, deep-linkable, and survives a refresh. The modal lives at [apps/web/components/appointments/scheduler-modal.tsx](../../apps/web/components/appointments/scheduler-modal.tsx).

### 3.2 Component shape

```tsx
// apps/web/components/appointments/scheduler-modal.tsx
'use client';

interface SchedulerModalProps {
  prospect: Prospect;          // pre-filled context
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScheduled?: (a: Appointment) => void;
}
```

Inputs:
- Date picker (shadcn `Calendar`)
- Time picker — 15-min increments, 06:00–22:00 range
- Duration picker — 30 / 60 / 90 / 120 min (default 60)
- Rufero `Select` populated from `suggest_rufero_for_prospect` RPC — shows name + distance + availability badge

Live validation (debounced 300ms):
- Calls `can_schedule(rufero_id, slot_start, duration)` on every change to date/time/duration/rufero
- Renders inline state: `ok` (green checkmark), `overlap` (red, with link to conflicting appointment), `outside_working_hours` (orange), `rufero_inactive` (red)

Save button disabled until result is `ok`.

### 3.3 Server Action

```ts
// apps/web/app/actions/appointments.ts
'use server';

export async function scheduleAppointment(input: {
  prospectId: string;
  ruferoId: string;
  scheduledAt: string;   // ISO
  durationMinutes: number;
  notes?: string;
}): Promise<Result<Appointment>> {
  const supabase = await createServerClient();

  // 1. Server-side recheck (don't trust the client's can_schedule result).
  const { data: check } = await supabase.rpc('can_schedule', {
    p_rufero_id: input.ruferoId,
    p_slot_start: input.scheduledAt,
    p_duration_minutes: input.durationMinutes,
  });
  if (!check?.allowed) {
    return { error: { code: check.reason, message: humanReason(check.reason) } };
  }

  // 2. Insert. The EXCLUDE constraint is the last line of defense for race conditions.
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      prospect_id: input.prospectId,
      rufero_id: input.ruferoId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      notes: input.notes,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') {       // EXCLUDE constraint violation
      return { error: { code: 'overlap', message: 'Slot just got booked. Pick another.' } };
    }
    return { error: { code: 'db_error', message: error.message } };
  }

  // 3. Update prospect status + log activity.
  await Promise.all([
    supabase.from('prospects').update({ status: 'appointment_set' }).eq('id', input.prospectId),
    supabase.from('activities').insert({
      prospect_id: input.prospectId,
      actor_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'appointment_scheduled',
      metadata: { appointment_id: data.id, scheduled_at: input.scheduledAt },
    }),
  ]);

  revalidatePath(`/prospects/${input.prospectId}`);
  revalidatePath('/appointments');

  return { data };
}
```

### 3.4 Role guards

- **Telefonista / Admin / Owner** — full access to schedule any appointment.
- **Rufero** — cannot open the modal (action button hidden on their view). They can only complete or no-show their own appointments (Stage 2).

Add `RoleGate role="not_rufero"` around the **Appt** button in the prospect card.

---

## 4. Mobile — schema sync only

Stage 1 does **not** add a mobile UI for scheduling. Ruferos don't book; Telefonistas do. The mobile side picks this up in Stage 7, where the rufero opens an existing appointment.

What Stage 1 *does* update on mobile:
- Regenerate `apps/mobile/lib/core/database/database.types.dart` (or whatever the equivalent codegen is) so the new `scheduled_range` column doesn't break entity parsing. If the mobile app uses Supabase row maps directly (as the prospects feature does), no codegen — just make sure `AppointmentModel.fromMap` ignores unknown columns.

---

## 5. Acceptance criteria

- [ ] `pnpm supabase db reset` applies the migration cleanly
- [ ] `SELECT can_schedule(rufero_id, now() + interval '1 day', 60)` returns `{allowed: true}` for an idle rufero
- [ ] Two concurrent inserts of the same `(rufero_id, scheduled_at)` → exactly one succeeds, the other gets `23P01`
- [ ] Booking outside tenant working hours → `{allowed: false, reason: 'outside_working_hours'}`
- [ ] Booking for a deactivated rufero → `{allowed: false, reason: 'rufero_inactive'}`
- [ ] Booking 30 min after another appointment ends → `{allowed: false, reason: 'overlap'}` (because of 120-min buffer)
- [ ] `suggest_rufero_for_prospect` returns ruferos ordered by distance, with `null` distance ruferos last
- [ ] Web: scheduler modal opens from prospect card → defaults to closest rufero, tomorrow 09:00, 60 min
- [ ] Picking an overlapping slot shows inline "Conflict" warning within 300ms of input
- [ ] Save → row in `appointments`, prospect status flips, activity row written
- [ ] RBAC: rufero account doesn't see the **Appt** button
- [ ] RLS: tenant B user calling `can_schedule` for tenant A's rufero → `forbidden`

---

## 6. Pitfalls to avoid

- **Don't** trust the client's `can_schedule` result on save — the server-action must recheck. Network latency between the live check and the save can let a conflict slip in.
- **Don't** forget the partial `WHERE status IN ('pending', 'confirmed')` on the `EXCLUDE` constraint. Without it, cancelled appointments hold their slots forever and the calendar fills up with phantom blocks.
- **Don't** compute distance with `ST_Distance` here — `point <-> point` is fast and accurate enough for "closest rufero" UX. Save PostGIS for the M3 proximity search.
- **Don't** put the 120-min buffer in application code. The schema is the source of truth; the modal just reflects it.
- **Don't** show ruferos who fail `rufero_inactive` in the suggestion list at all. Showing them with a disabled state confuses the Telefonista.
- **Don't** set `prospect.status = 'appointment_set'` if the prospect is already `signed` or `closed` — those are terminal states. Add a check before the status update.
- **Don't** allow scheduling in the past. Add a server-action check: `if (new Date(scheduledAt) < new Date()) return error`. The DB doesn't enforce this; the UI must.

---

## 7. What ships at end of Stage 1

- 1 migration file: `0XX_m5_appointments.sql`
- 2 SQL functions: `can_schedule`, `suggest_rufero_for_prospect`
- 1 web modal: `scheduler-modal.tsx`
- 1 server action: `scheduleAppointment`
- 1 hook to the existing prospect card **Appt** button
- Updated `prospects.status` write path (activity log + revalidate)

Stage 2 picks up the calendar consumer for these rows.
