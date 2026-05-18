-- ============================================================
-- ROOF-AID CRM — M4 Stage 3: SMS extensions
-- Expands sms_logs to support inbound + queued + audit
-- ============================================================

-- ------------------------------------------------------------
-- Status: extend allowed values
-- 'queued'    — placeholder before Telnyx acks (we currently send synchronously,
--               but keep the value reserved for future async send)
-- 'sent'      — Telnyx 200'd back
-- 'delivered' — carrier confirmed delivery (outbound webhook)
-- 'failed'    — Telnyx or carrier failed
-- 'received'  — inbound from homeowner
-- ------------------------------------------------------------
ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_status_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received'));

-- ------------------------------------------------------------
-- New columns
-- ------------------------------------------------------------
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS segments INT DEFAULT 1,
  -- Compliance audit trail. When the caller overrides a DNC or
  -- outside-calling-hours warning, the array records which warning(s)
  -- they acknowledged. Empty array = no warnings were active.
  ADD COLUMN IF NOT EXISTS acknowledged_warnings TEXT[] NOT NULL DEFAULT '{}',
  -- Provider error code (Telnyx or carrier) on failed sends — useful
  -- for distinguishing "invalid number" from "carrier blocked".
  ADD COLUMN IF NOT EXISTS error_code TEXT;

-- ------------------------------------------------------------
-- Helpful indexes for the SMS thread query
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sms_logs_prospect_thread
  ON sms_logs (prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;

-- Inbound from-number lookup (auto-DNC + unmatched-message triage)
CREATE INDEX IF NOT EXISTS sms_logs_from_inbound
  ON sms_logs (tenant_id, from_number, created_at DESC)
  WHERE direction = 'inbound';

-- ------------------------------------------------------------
-- Enable Realtime so the UI can subscribe to live thread updates
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sms_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs';
  END IF;
END $$;
