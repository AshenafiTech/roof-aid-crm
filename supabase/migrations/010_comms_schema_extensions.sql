-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: Communications schema extensions
-- ============================================================
-- Adds tenant-level config (timezone, calling-hours, templates,
-- recording disclosure URL), idempotency uniques on the existing
-- provider id columns, the SMS read marker, and two internal tables
-- (webhook_events for audit, tasks for the async-send worker).
--
-- DNC IS DELIBERATELY NOT A HARD BLOCK in any of the M4 RPCs — per
-- the client policy (matches the M3-6 deviation) DNC is informational:
-- the UI's DncBanner warns the agent, who takes responsibility for the
-- contact. See migration 011 for the can_call / can_message bodies.
-- ============================================================

-- ── 1. Tenant-level communications config ────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS calling_hours JSONB NOT NULL DEFAULT '{
    "mon":{"start":"08:00","end":"20:00"},
    "tue":{"start":"08:00","end":"20:00"},
    "wed":{"start":"08:00","end":"20:00"},
    "thu":{"start":"08:00","end":"20:00"},
    "fri":{"start":"08:00","end":"20:00"},
    "sat":{"start":"09:00","end":"17:00"},
    "sun":null
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_disclosure_audio_url TEXT;

-- ── 2. Idempotency uniques on existing provider id columns ───
-- Webhooks retry; without UNIQUE we'd see duplicate call/sms/email rows.
-- Partial indexes so existing NULL rows (no provider id yet) don't
-- conflict.

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_telnyx_call_id_uidx
  ON call_logs (telnyx_call_id) WHERE telnyx_call_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sms_logs_telnyx_message_id_uidx
  ON sms_logs (telnyx_message_id) WHERE telnyx_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_sendgrid_message_id_uidx
  ON email_logs (sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;

-- ── 3. SMS thread enhancements ───────────────────────────────
-- Mobile's SmsTab + future web thread component need a richer status
-- enum (queued/received in addition to sent/delivered/failed) and a
-- per-row read marker for unread badging.
--
-- Strategy: add `delivery_status` alongside the existing `status` so
-- we don't break the auto-generated database.types.ts on the web side.
-- New code (mobile, M4 web) reads/writes `delivery_status`. A trigger
-- mirrors writes both ways for the transition period; the web team
-- can drop `status` after types regen + a search-and-replace pass.

ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    CHECK (delivery_status IN ('queued','sent','delivered','failed','received')),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Backfill existing rows (status was 'sent'|'delivered'|'failed' — all
-- valid in the new enum, no remap needed).
UPDATE sms_logs SET delivery_status = status WHERE delivery_status IS NULL AND status IS NOT NULL;
UPDATE sms_logs SET sent_at = created_at WHERE sent_at IS NULL;

-- Trigger: keep status and delivery_status in sync until status is
-- removed. Writers can hit either column; the other catches up.
CREATE OR REPLACE FUNCTION sms_logs_sync_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
     AND NEW.delivery_status IN ('sent','delivered','failed') THEN
    NEW.status := NEW.delivery_status;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
        AND (NEW.delivery_status IS NULL OR NEW.delivery_status = OLD.delivery_status) THEN
    NEW.delivery_status := NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sms_logs_sync_status_trg ON sms_logs;
CREATE TRIGGER sms_logs_sync_status_trg
  BEFORE INSERT OR UPDATE ON sms_logs
  FOR EACH ROW EXECUTE FUNCTION sms_logs_sync_status();

CREATE INDEX IF NOT EXISTS sms_logs_prospect_unread_idx
  ON sms_logs (prospect_id) WHERE direction = 'inbound' AND read_at IS NULL;

-- ── 4. webhook_events: signed audit trail ────────────────────
-- Every webhook delivery is logged here BEFORE dispatching, with the
-- signature-verification result. Lets us replay or post-mortem a bad
-- event without touching the live provider.

CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL CHECK (provider IN ('telnyx','sendgrid')),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_ok  BOOLEAN NOT NULL,
  processed_at  TIMESTAMPTZ,
  process_error TEXT
);

CREATE INDEX IF NOT EXISTS webhook_events_recent_idx
  ON webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx
  ON webhook_events (received_at) WHERE processed_at IS NULL;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = service role only (it bypasses RLS). Authenticated
-- users have no business reading raw provider payloads.

-- ── 5. tasks: async outbound queue ───────────────────────────
-- The `send_sms` RPC (Stage 3) inserts a queued row into sms_logs and
-- enqueues a `telnyx.send_sms` task here. A scheduled Edge Function
-- (process-tasks, Stage 3) picks rows up, calls Telnyx, and updates
-- the sms_logs row. Keeps RPCs fast — Telnyx latency never blocks
-- the user's tap.

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  processed_at  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_due_idx
  ON tasks (kind, scheduled_at) WHERE processed_at IS NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- Service role only (queue is internal infrastructure).
