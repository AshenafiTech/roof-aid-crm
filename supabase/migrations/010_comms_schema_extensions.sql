-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: Communications schema extensions
-- Adds tenant-level config, idempotency columns, webhook audit
-- ============================================================

-- ------------------------------------------------------------
-- Tenants: timezone, calling hours, templates, recording prompt
-- ------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone        text NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS calling_hours   jsonb NOT NULL DEFAULT '{
    "mon":{"start":"08:00","end":"20:00"},
    "tue":{"start":"08:00","end":"20:00"},
    "wed":{"start":"08:00","end":"20:00"},
    "thu":{"start":"08:00","end":"20:00"},
    "fri":{"start":"08:00","end":"20:00"},
    "sat":{"start":"09:00","end":"17:00"},
    "sun":null
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_templates   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_disclosure_audio_url text;

-- ------------------------------------------------------------
-- Users: enforce uniqueness on telnyx_extension
-- (column already exists from 002_core_tables.sql)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_telnyx_extension_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_telnyx_extension_key UNIQUE (telnyx_extension);
  END IF;
END $$;

-- ------------------------------------------------------------
-- Idempotency on every external event row
-- Each provider event has a unique id; the webhook upserts on it
-- ------------------------------------------------------------
ALTER TABLE call_logs  ADD COLUMN IF NOT EXISTS provider_event_id   text;
ALTER TABLE sms_logs   ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_provider_event_id_key
  ON call_logs (provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_logs_provider_message_id_key
  ON sms_logs (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_provider_message_id_key
  ON email_logs (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ------------------------------------------------------------
-- Webhook events audit table
-- Every inbound webhook (Telnyx, SendGrid) is logged here
-- before any handler runs. Keeps an immutable replay log.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL CHECK (provider IN ('telnyx', 'sendgrid')),
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  signature_ok  boolean NOT NULL,
  processed_at  timestamptz,
  process_error text
);

CREATE INDEX IF NOT EXISTS webhook_events_recent
  ON webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_events_unprocessed
  ON webhook_events (received_at)
  WHERE processed_at IS NULL;

-- RLS: only service-role and super_admin can read raw events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_super_admin_select" ON webhook_events
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'super_admin');

-- INSERT/UPDATE happen via service role (Edge Functions); no policy needed
-- for authenticated role since service role bypasses RLS.
