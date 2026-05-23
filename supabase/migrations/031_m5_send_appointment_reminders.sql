-- ============================================================
-- ROOF-AID CRM — Milestone 5 Stage 3
-- send_appointment_reminders() — single SQL function that picks
-- due rows from appointment_reminders, sends the SMS via the
-- existing pg_net + Telnyx path (matches 022), and stamps idempotency.
--
-- Driven by pg_cron every 5 minutes. Late-running runs still send
-- overdue reminders (no upper bound), so a cron skip doesn't
-- silently drop a homeowner notification.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------
-- Fallback SMS templates (TCPA-compliant — include STOP wording).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _reminder_template(
  p_tenant_id uuid,
  p_kind      text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_templates jsonb;
  v_match     text;
  v_key       text;
BEGIN
  v_key := CASE p_kind
    WHEN '24h' THEN 'appointment_reminder_24h'
    WHEN '2h'  THEN 'appointment_reminder_2h'
    ELSE NULL
  END;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  SELECT sms_templates INTO v_templates FROM tenants WHERE id = p_tenant_id;

  -- sms_templates may be jsonb array OR object map — handle both safely.
  IF jsonb_typeof(v_templates) = 'array' THEN
    SELECT body INTO v_match
      FROM jsonb_to_recordset(v_templates) AS x(kind text, body text, active boolean)
     WHERE x.kind = v_key AND (x.active IS NULL OR x.active)
     LIMIT 1;
  ELSIF jsonb_typeof(v_templates) = 'object' THEN
    v_match := v_templates ->> v_key;
  END IF;

  IF v_match IS NULL OR length(btrim(v_match)) = 0 THEN
    v_match := CASE p_kind
      WHEN '24h' THEN
        'Hi {homeowner_name}, this is a reminder from {company_name} — your roof inspection is scheduled for {appointment_time}. Reply STOP to unsubscribe.'
      WHEN '2h' THEN
        'Hi {homeowner_name}, your roof inspection with {company_name} is in 2 hours ({appointment_time}). Reply STOP to unsubscribe.'
      ELSE 'Reminder: your roof inspection is upcoming. Reply STOP to unsubscribe.'
    END;
  END IF;

  -- Belt-and-suspenders: always append STOP wording if a tenant-customised
  -- template dropped it. Safer than a TCPA flag.
  IF v_match !~* 'stop' THEN
    v_match := v_match || ' Reply STOP to unsubscribe.';
  END IF;
  RETURN v_match;
END;
$$;

-- ------------------------------------------------------------
-- send_appointment_reminders() — cron entry point.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_appointment_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_sent      int := 0;
  v_failed    int := 0;
  v_row       record;
  v_template  text;
  v_body      text;
  v_to        text;
  v_phone_id  uuid;
  v_from      text;
  v_api_key   text;
  v_verdict   jsonb;
  v_can_send  boolean;
  v_reason    text;
  v_local_t   text;
BEGIN
  SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
   WHERE name = 'TELNYX_API_KEY';

  FOR v_row IN
    SELECT r.id                  AS reminder_id,
           r.tenant_id,
           r.kind,
           r.attempts,
           a.id                  AS appointment_id,
           a.scheduled_at,
           a.status              AS appt_status,
           p.id                  AS prospect_id,
           p.name                AS prospect_name,
           p.phones              AS prospect_phones,
           t.name                AS tenant_name,
           t.timezone            AS tenant_tz
      FROM appointment_reminders r
      JOIN appointments a ON a.id = r.appointment_id
      JOIN prospects   p ON p.id = a.prospect_id
      JOIN tenants     t ON t.id = r.tenant_id
     WHERE r.sent_at IS NULL
       AND r.scheduled_send_at <= now() + interval '5 minutes'
       AND r.attempts < 5
     ORDER BY r.scheduled_send_at
     LIMIT 100
  LOOP
    v_processed := v_processed + 1;

    -- Defensive: trigger should have removed terminal reminders.
    IF v_row.appt_status NOT IN ('pending','confirmed') THEN
      DELETE FROM appointment_reminders WHERE id = v_row.reminder_id;
      CONTINUE;
    END IF;

    v_to := v_row.prospect_phones[1];
    IF v_to IS NULL OR length(btrim(v_to)) = 0 THEN
      UPDATE appointment_reminders
         SET sent_at = now(),
             failure_reason = 'no_phone',
             attempts = v_row.attempts + 1
       WHERE id = v_row.reminder_id;
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    -- DNC: skip and stamp a non-retry sentinel.
    BEGIN
      v_verdict := can_message(v_row.prospect_id);
      v_can_send := COALESCE((v_verdict->>'allowed')::boolean, false);
      v_reason   := v_verdict->>'reason';
    EXCEPTION WHEN OTHERS THEN
      v_can_send := true;  -- if the check itself errors, attempt the send
      v_reason   := NULL;
    END;
    IF NOT v_can_send AND v_reason = 'dnc' THEN
      UPDATE appointment_reminders
         SET sent_at = now(),
             failure_reason = 'dnc',
             attempts = v_row.attempts + 1
       WHERE id = v_row.reminder_id;
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    -- Render template.
    v_template := _reminder_template(v_row.tenant_id, v_row.kind);
    v_local_t  := to_char(v_row.scheduled_at AT TIME ZONE COALESCE(v_row.tenant_tz, 'UTC'),
                          'Dy, Mon DD, FMHH12:MI AM');
    v_body := replace(v_template, '{homeowner_name}',  COALESCE(v_row.prospect_name, 'there'));
    v_body := replace(v_body,    '{appointment_time}', v_local_t);
    v_body := replace(v_body,    '{company_name}',     COALESCE(v_row.tenant_name, 'our team'));

    -- Resolve tenant's primary SMS-capable number.
    SELECT id, e164 INTO v_phone_id, v_from
      FROM tenant_phone_numbers
     WHERE tenant_id = v_row.tenant_id
       AND status = 'active'
       AND 'sms' = ANY(capabilities)
     ORDER BY is_primary DESC, created_at ASC
     LIMIT 1;

    IF v_phone_id IS NULL OR v_api_key IS NULL THEN
      UPDATE appointment_reminders
         SET attempts = v_row.attempts + 1,
             failure_reason = CASE
               WHEN v_phone_id IS NULL THEN 'tenant_has_no_sms_number'
               ELSE 'telnyx_api_key_missing'
             END
       WHERE id = v_row.reminder_id;
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    -- Insert outbound sms_logs row so the conversation history shows it
    -- and so the telnyx-webhook can match it.
    INSERT INTO sms_logs (
      tenant_id, prospect_id, agent_id, direction,
      body, status, from_number, to_number,
      tenant_phone_number_id, segments
    ) VALUES (
      v_row.tenant_id, v_row.prospect_id, NULL, 'outbound',
      v_body, 'queued', v_from, v_to,
      v_phone_id, 1
    );

    -- Fire-and-forget Telnyx send.
    PERFORM net.http_post(
      url     := 'https://api.telnyx.com/v2/messages',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_api_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'from', v_from,
        'to',   v_to,
        'text', v_body
      )
    );

    UPDATE appointment_reminders
       SET sent_at = now(),
           attempts = v_row.attempts + 1,
           failure_reason = NULL
     WHERE id = v_row.reminder_id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'sent',      v_sent,
    'failed',    v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION send_appointment_reminders() FROM PUBLIC;
-- Only the scheduler invokes this. No GRANT to authenticated.

-- ------------------------------------------------------------
-- pg_cron — every 5 minutes.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders'
  ) THEN
    PERFORM cron.schedule(
      'send-appointment-reminders',
      '*/5 * * * *',
      $cron$ SELECT send_appointment_reminders(); $cron$
    );
  END IF;
END $$;
