-- ============================================================
-- ROOF-AID CRM — M4 Stage 2: call_logs lifecycle fixes
--
-- Why: Telnyx emits multiple events per call (initiated, answered,
-- hangup, recording.saved). Each carries a *different* event id but
-- the SAME call_control_id. Migration 010 added a UNIQUE on
-- provider_event_id, which would have made the second event for any
-- call collide and be silently dropped. We switch the dedup key to
-- telnyx_call_id and add the timestamps + columns the dispatcher
-- needs to build a single rolled-up row per call.
--
-- Safe to run: call_logs is empty in the live DB (verified via REST).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the wrong dedup index, add the right one
-- ------------------------------------------------------------
DROP INDEX IF EXISTS call_logs_provider_event_id_key;

-- We're keeping the column for now in case someone wants per-event
-- audit, but it's no longer unique.
COMMENT ON COLUMN call_logs.provider_event_id IS
  'DEPRECATED — was the unique dedup key, but a single call emits multiple Telnyx events. The webhook now upserts by telnyx_call_id. May be repurposed as the most-recent event id.';

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_telnyx_call_id_key
  ON call_logs (telnyx_call_id)
  WHERE telnyx_call_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Lifecycle timestamps
-- The webhook fills these as the call progresses.
-- created_at stays = "row first inserted (call.initiated)".
-- ------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS started_at  timestamptz,  -- call.initiated
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,  -- call.answered
  ADD COLUMN IF NOT EXISTS ended_at    timestamptz;  -- call.hangup

-- ------------------------------------------------------------
-- 3. Recording: split URL from canonical storage path
-- recording_url stays as "Telnyx-hosted URL" (transient).
-- recording_storage_path = "call-recordings/{tenant_id}/{call_id}.mp3"
-- once we copy it into our bucket.
-- ------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS recording_storage_path text;

-- ------------------------------------------------------------
-- 4. Compliance audit trail (mirrors sms_logs.acknowledged_warnings)
-- ------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS acknowledged_warnings text[] NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- 5. Error / hangup detail for failed or weird calls
-- ------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS error_code    text,
  ADD COLUMN IF NOT EXISTS hangup_cause  text,    -- Telnyx hangup_cause: normal_clearing, busy, no_answer, ...
  ADD COLUMN IF NOT EXISTS hangup_source text;    -- caller | callee | system

-- ------------------------------------------------------------
-- 6. Expand disposition CHECK
-- A call can fail to connect; the prior set didn't represent that.
-- ------------------------------------------------------------
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_disposition_check;
ALTER TABLE call_logs ADD CONSTRAINT call_logs_disposition_check
  CHECK (disposition IS NULL OR disposition IN (
    'answered',
    'no_answer',
    'voicemail',
    'wrong_number',
    'dnc_request',
    'callback_requested',
    'busy',
    'failed',
    'cancelled',
    'not_connected'
  ));

-- duration_seconds should never be negative
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_duration_seconds_nonneg;
ALTER TABLE call_logs ADD CONSTRAINT call_logs_duration_seconds_nonneg
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

-- ------------------------------------------------------------
-- 7. Indexes for the call list / agent timeline
-- (call_logs_telnyx_call_id_key from step 1 already serves the
-- webhook's per-call lookup.)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS call_logs_agent_timeline
  ON call_logs (tenant_id, agent_id, started_at DESC NULLS LAST)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS call_logs_prospect_thread
  ON call_logs (prospect_id, started_at DESC NULLS LAST)
  WHERE prospect_id IS NOT NULL;

-- The 013 per-number index used created_at; switch to started_at for
-- the rollup queries (when did the call actually start, not when did
-- the row get inserted — those can drift on retry).
DROP INDEX IF EXISTS call_logs_per_number;
CREATE INDEX IF NOT EXISTS call_logs_per_number
  ON call_logs (tenant_phone_number_id, started_at DESC NULLS LAST)
  WHERE tenant_phone_number_id IS NOT NULL;

-- ------------------------------------------------------------
-- 8. RLS: clamp insert direction for non-service callers
-- The webhook (service role) writes inbound rows; the web/mobile
-- session (authenticated) should only ever insert outbound. Without
-- this, a hostile client could forge inbound rows under their own
-- tenant.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "call_logs_insert" ON call_logs;
CREATE POLICY "call_logs_insert" ON call_logs FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND direction = 'outbound'
  );

-- Allow agents to update their own call rows (disposition, ack warnings)
-- but not change tenant or direction.
DROP POLICY IF EXISTS "call_logs_update" ON call_logs;
CREATE POLICY "call_logs_update" ON call_logs FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_tenant_id()
    AND (
      public.get_user_role() IN ('owner', 'admin', 'super_admin')
      OR agent_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 9. Realtime: live softphone state, call list, prospect call tab
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE call_logs';
  END IF;
END $$;
