-- ============================================================
-- ROOF-AID CRM — Milestone 5
-- Fix: schedule_appointment_reminders() must run with elevated
-- privileges. The trigger writes to appointment_reminders, which
-- has RLS enabled with only a SELECT policy (writes are reserved
-- for the lifecycle trigger and the Edge Function). Without
-- SECURITY DEFINER the trigger executes as the calling user and
-- INSERT/UPDATE/DELETE on appointment_reminders is blocked by RLS,
-- surfacing as "new row violates row-level security policy" when
-- creating or rescheduling an appointment.
-- ============================================================

CREATE OR REPLACE FUNCTION schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

REVOKE ALL ON FUNCTION schedule_appointment_reminders() FROM PUBLIC;
