-- ============================================================
-- ROOF-AID CRM — Milestone 5 Stage 2
-- appointment_status_history audit log + auto-population trigger.
-- See docs/milestone5/stage-2-calendar-and-status.md §2.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  reason          text,
  actor_id        uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_status_history_appointment_idx
  ON appointment_status_history (appointment_id, created_at DESC);

ALTER TABLE appointment_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_status_history_select_tenant ON appointment_status_history;
CREATE POLICY appointment_status_history_select_tenant
  ON appointment_status_history FOR SELECT
  USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS appointment_status_history_insert_tenant ON appointment_status_history;
CREATE POLICY appointment_status_history_insert_tenant
  ON appointment_status_history FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id());

-- Trigger: log every status change.
CREATE OR REPLACE FUNCTION log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO appointment_status_history (
      tenant_id, appointment_id, from_status, to_status, reason, actor_id
    ) VALUES (
      NEW.tenant_id, NEW.id, OLD.status, NEW.status,
      NEW.cancellation_reason,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_status_change_log ON appointments;
CREATE TRIGGER appointments_status_change_log
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION log_appointment_status_change();

-- ============================================================
-- rescheduled_from FK + side-effect: when reschedule lands as a new row
-- pointing back to an old one, we want a fast lookup of the chain.
-- ============================================================
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_rescheduled_from_idx
  ON appointments (rescheduled_from);

-- Realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointment_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_status_history;
  END IF;
END $$;
