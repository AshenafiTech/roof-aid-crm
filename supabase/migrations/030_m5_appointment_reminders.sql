-- ============================================================
-- ROOF-AID CRM — Milestone 5 Stage 3
-- Appointment reminder queue + lifecycle trigger + cron.
-- See docs/milestone5/stage-3-appointment-reminders.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id        uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('24h','2h')),
  scheduled_send_at     timestamptz NOT NULL,
  sent_at               timestamptz,
  provider_message_id   text,
  failure_reason        text,
  attempts              int NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (appointment_id, kind)
);

CREATE INDEX IF NOT EXISTS appointment_reminders_due_idx
  ON appointment_reminders (scheduled_send_at)
  WHERE sent_at IS NULL;

ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_reminders_select_tenant ON appointment_reminders;
CREATE POLICY appointment_reminders_select_tenant
  ON appointment_reminders FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- No app-level insert/update policies — only the Edge Function (service
-- role) and the lifecycle trigger write here.

-- ============================================================
-- Trigger — queue / requeue / dequeue reminders on appointment writes.
-- ============================================================
CREATE OR REPLACE FUNCTION schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'confirmed') THEN
    INSERT INTO appointment_reminders (tenant_id, appointment_id, kind, scheduled_send_at)
    VALUES
      (NEW.tenant_id, NEW.id, '24h', NEW.scheduled_at - interval '24 hours'),
      (NEW.tenant_id, NEW.id, '2h',  NEW.scheduled_at - interval '2 hours')
    ON CONFLICT (appointment_id, kind) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Time shift: re-queue any still-unsent reminders.
    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
       AND NEW.status IN ('pending', 'confirmed') THEN
      UPDATE appointment_reminders
         SET scheduled_send_at = NEW.scheduled_at - interval '24 hours'
       WHERE appointment_id = NEW.id AND kind = '24h' AND sent_at IS NULL;
      UPDATE appointment_reminders
         SET scheduled_send_at = NEW.scheduled_at - interval '2 hours'
       WHERE appointment_id = NEW.id AND kind = '2h' AND sent_at IS NULL;
    END IF;

    -- Terminal status: drop any unsent reminders so nothing fires.
    IF NEW.status IN ('cancelled', 'no_show', 'completed', 'rescheduled')
       AND OLD.status NOT IN ('cancelled', 'no_show', 'completed', 'rescheduled') THEN
      DELETE FROM appointment_reminders
       WHERE appointment_id = NEW.id AND sent_at IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_reminder_lifecycle ON appointments;
CREATE TRIGGER appointments_reminder_lifecycle
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION schedule_appointment_reminders();

-- Backfill: any existing pending/confirmed future appointments without reminders.
INSERT INTO appointment_reminders (tenant_id, appointment_id, kind, scheduled_send_at)
SELECT a.tenant_id, a.id, '24h', a.scheduled_at - interval '24 hours'
FROM appointments a
WHERE a.status IN ('pending','confirmed')
  AND a.scheduled_at > now()
ON CONFLICT (appointment_id, kind) DO NOTHING;

INSERT INTO appointment_reminders (tenant_id, appointment_id, kind, scheduled_send_at)
SELECT a.tenant_id, a.id, '2h', a.scheduled_at - interval '2 hours'
FROM appointments a
WHERE a.status IN ('pending','confirmed')
  AND a.scheduled_at > now()
ON CONFLICT (appointment_id, kind) DO NOTHING;

-- Realtime — useful for an ops dashboard later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointment_reminders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_reminders;
  END IF;
END $$;
