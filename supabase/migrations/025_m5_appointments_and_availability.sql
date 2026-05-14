-- ============================================================
-- ROOF-AID CRM — Milestone 5 Step 1
-- Stage 1 (appointment scheduler) + Stage 7 (mobile inspection)
-- schema additions, plus the canonical `no_show` status rename.
-- See docs/milestone5/blocker-solution-implementation-plan.md.
-- ============================================================

-- 0. Extension required for EXCLUDE USING gist on (uuid, tstzrange).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. Status rename: 'no-show' (hyphen) → 'no_show' (underscore).
--    Must run BEFORE the new CHECK constraint, because the new
--    constraint rejects the old hyphenated value.
-- ============================================================
UPDATE appointments SET status = 'no_show' WHERE status = 'no-show';

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending','confirmed','completed','cancelled','no_show','rescheduled'));

-- ============================================================
-- 2. Tenants — timezone (needed by can_schedule) + working_hours.
-- ============================================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

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

-- ============================================================
-- 3. Users — per-rufero working_hours override.
--    (home_base_coords + home_base_address already exist in M1.)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS working_hours jsonb;

-- ============================================================
-- 4. Appointments — generated tstzrange (with 120-min travel
--    buffer), gist index, EXCLUDE constraint.
-- ============================================================
-- `timestamptz + interval` is STABLE, not IMMUTABLE, so it can't live in a
-- GENERATED column. We use a regular column maintained by a trigger; the
-- semantics are identical from the GIST index / EXCLUDE constraint's
-- perspective.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS scheduled_range tstzrange;

CREATE OR REPLACE FUNCTION appointments_set_scheduled_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.scheduled_range := tstzrange(
    NEW.scheduled_at,
    NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 60) + 120),
    '[)'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_set_scheduled_range ON appointments;
CREATE TRIGGER appointments_set_scheduled_range
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes
  ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION appointments_set_scheduled_range();

-- Backfill existing rows.
UPDATE appointments
   SET scheduled_range = tstzrange(
     scheduled_at,
     scheduled_at + make_interval(mins => COALESCE(duration_minutes, 60) + 120),
     '[)'
   )
 WHERE scheduled_range IS NULL;

CREATE INDEX IF NOT EXISTS appointments_scheduled_range_gist
  ON appointments USING gist (rufero_id, scheduled_range);

-- The EXCLUDE constraint refuses two overlapping pending/confirmed
-- rows for the same rufero. Cancelled / no_show / completed /
-- rescheduled rows are excluded via the partial WHERE so they
-- don't hold the slot forever.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_no_overlap
      EXCLUDE USING gist (rufero_id WITH =, scheduled_range WITH &&)
      WHERE (status IN ('pending','confirmed'));
  END IF;
END $$;

-- ============================================================
-- 5. rufero_availability_blocks — busy + available_extra ranges.
--    Used by Stage 9 mobile Calendar + Stage 2 web admin
--    "Block rufero time" action.
-- ============================================================
CREATE TABLE IF NOT EXISTS rufero_availability_blocks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rufero_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  all_day              boolean DEFAULT false,
  kind                 text NOT NULL CHECK (kind IN ('busy','available_extra')),
  reason               text,
  notes                text,
  recurrence_rule      text,
  recurrence_parent_id uuid REFERENCES rufero_availability_blocks(id) ON DELETE CASCADE,
  created_by           uuid REFERENCES users(id),
  created_at           timestamptz DEFAULT now(),
  block_range          tstzrange GENERATED ALWAYS AS (
    tstzrange(starts_at, ends_at, '[)')
  ) STORED,
  CONSTRAINT ends_after_starts CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS rufero_blocks_rufero_range_gist
  ON rufero_availability_blocks USING gist (rufero_id, block_range);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'availability_blocks_no_overlap'
  ) THEN
    ALTER TABLE rufero_availability_blocks
      ADD CONSTRAINT availability_blocks_no_overlap
      EXCLUDE USING gist (rufero_id WITH =, block_range WITH &&)
      WHERE (kind = 'busy');
  END IF;
END $$;

ALTER TABLE rufero_availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rufero_blocks_select_tenant ON rufero_availability_blocks;
CREATE POLICY rufero_blocks_select_tenant ON rufero_availability_blocks FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS rufero_blocks_modify_self_or_admin ON rufero_availability_blocks;
CREATE POLICY rufero_blocks_modify_self_or_admin ON rufero_availability_blocks
  FOR ALL
  USING (
    tenant_id = public.get_tenant_id()
    AND (
      rufero_id = auth.uid()
      OR public.get_user_role() IN ('admin','owner','super_admin')
    )
  )
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND (
      rufero_id = auth.uid()
      OR public.get_user_role() IN ('admin','owner','super_admin')
    )
  );

-- ============================================================
-- 6. Inspection reports — Stage 7 column additions.
-- ============================================================
ALTER TABLE inspection_reports
  ADD COLUMN IF NOT EXISTS roof_age_years        int,
  ADD COLUMN IF NOT EXISTS roof_material         text,
  ADD COLUMN IF NOT EXISTS storm_date            date,
  ADD COLUMN IF NOT EXISTS affected_areas        text[],
  ADD COLUMN IF NOT EXISTS severity              int,
  ADD COLUMN IF NOT EXISTS scope_notes           text,
  ADD COLUMN IF NOT EXISTS photo_count_expected  int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at          timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_reports_severity_check'
  ) THEN
    ALTER TABLE inspection_reports
      ADD CONSTRAINT inspection_reports_severity_check
      CHECK (severity IS NULL OR severity BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inspection_reports_appointment_idx
  ON inspection_reports (appointment_id);

-- ============================================================
-- 7. photos — Stage 7 new table.
-- ============================================================
CREATE TABLE IF NOT EXISTS photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inspection_id   uuid REFERENCES inspection_reports(id) ON DELETE CASCADE,
  prospect_id     uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,
  tags            text[] NOT NULL,
  gps_lat         double precision,
  gps_lng         double precision,
  taken_at        timestamptz NOT NULL,
  uploaded_at     timestamptz,
  width_px        int,
  height_px       int,
  file_size_bytes int,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_inspection_idx ON photos (inspection_id);
CREATE INDEX IF NOT EXISTS photos_prospect_idx   ON photos (prospect_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photos_select_tenant ON photos;
CREATE POLICY photos_select_tenant ON photos FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS photos_insert_tenant ON photos;
CREATE POLICY photos_insert_tenant ON photos FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS photos_update_tenant ON photos;
CREATE POLICY photos_update_tenant ON photos FOR UPDATE
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS photos_delete_tenant ON photos;
CREATE POLICY photos_delete_tenant ON photos FOR DELETE
  USING (
    tenant_id = public.get_tenant_id()
    AND (
      created_by = auth.uid()
      OR public.get_user_role() IN ('admin','owner','super_admin')
    )
  );

-- ============================================================
-- 8. RPC: can_schedule(rufero_id, slot_start, duration_minutes)
--    Returns jsonb: { allowed: bool, reason: text, ...refs }
-- ============================================================
CREATE OR REPLACE FUNCTION can_schedule(
  p_rufero_id        uuid,
  p_slot_start       timestamptz,
  p_duration_minutes int DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id        uuid;
  v_tz               text;
  v_tenant_hours     jsonb;
  v_user_hours       jsonb;
  v_effective_hours  jsonb;
  v_day_key          text;
  v_day_window       jsonb;
  v_local_time       time;
  v_slot_end         timestamptz;
  v_conflict_id      uuid;
  v_rufero_active    boolean;
  v_busy_block_id    uuid;
  v_extra_block_count int;
  v_caller_tenant    uuid;
BEGIN
  v_slot_end := p_slot_start + (p_duration_minutes * interval '1 minute');

  SELECT tenant_id, is_active, working_hours
    INTO v_tenant_id, v_rufero_active, v_user_hours
  FROM users
  WHERE id = p_rufero_id AND role = 'rufero';

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rufero_not_found');
  END IF;

  IF NOT v_rufero_active THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rufero_inactive');
  END IF;

  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = auth.uid();
  IF v_tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'forbidden');
  END IF;

  SELECT timezone, working_hours INTO v_tz, v_tenant_hours
  FROM tenants
  WHERE id = v_tenant_id;

  v_effective_hours := COALESCE(v_user_hours, v_tenant_hours);
  v_day_key    := lower(to_char(p_slot_start AT TIME ZONE v_tz, 'dy'));
  v_day_window := v_effective_hours -> v_day_key;
  v_local_time := (p_slot_start AT TIME ZONE v_tz)::time;

  IF v_day_window IS NULL
     OR v_day_window = 'null'::jsonb
     OR v_local_time < (v_day_window->>'start')::time
     OR (v_slot_end AT TIME ZONE v_tz)::time > (v_day_window->>'end')::time THEN
    SELECT count(*) INTO v_extra_block_count
    FROM rufero_availability_blocks
    WHERE rufero_id = p_rufero_id
      AND kind = 'available_extra'
      AND block_range @> tstzrange(p_slot_start, v_slot_end, '[)');

    IF v_extra_block_count = 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'outside_working_hours');
    END IF;
  END IF;

  SELECT id INTO v_busy_block_id
  FROM rufero_availability_blocks
  WHERE rufero_id = p_rufero_id
    AND kind = 'busy'
    AND block_range && tstzrange(p_slot_start, v_slot_end, '[)')
  LIMIT 1;

  IF v_busy_block_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'overlap_with_block',
      'conflicting_block_id', v_busy_block_id
    );
  END IF;

  SELECT id INTO v_conflict_id
  FROM appointments
  WHERE rufero_id = p_rufero_id
    AND status IN ('pending','confirmed')
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

GRANT EXECUTE ON FUNCTION can_schedule(uuid, timestamptz, int) TO authenticated;

-- ============================================================
-- 9. RPC: suggest_rufero_for_prospect(prospect_id, slot_start, duration_minutes)
--    Returns the tenant's active ruferos with distance + can_schedule result.
-- ============================================================
CREATE OR REPLACE FUNCTION suggest_rufero_for_prospect(
  p_prospect_id      uuid,
  p_slot_start       timestamptz,
  p_duration_minutes int DEFAULT 60
) RETURNS TABLE (
  rufero_id           uuid,
  display_name        text,
  distance_miles      numeric,
  can_schedule_result jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_prospect_coords point;
BEGIN
  SELECT tenant_id, coordinates INTO v_tenant_id, v_prospect_coords
  FROM prospects
  WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF v_tenant_id <> (SELECT tenant_id FROM users WHERE id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(NULLIF(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), u.email),
    CASE
      WHEN u.home_base_coords IS NULL OR v_prospect_coords IS NULL THEN NULL
      ELSE ((u.home_base_coords <-> v_prospect_coords) * 69.0)::numeric
    END,
    can_schedule(u.id, p_slot_start, p_duration_minutes)
  FROM users u
  WHERE u.tenant_id = v_tenant_id
    AND u.role = 'rufero'
    AND u.is_active
  ORDER BY 3 NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_rufero_for_prospect(uuid, timestamptz, int) TO authenticated;

-- ============================================================
-- 10. Realtime — publish the new tables (idempotent).
--     `appointments` is included so the web calendar / mobile
--     list pick up status changes live.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rufero_availability_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rufero_availability_blocks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;
