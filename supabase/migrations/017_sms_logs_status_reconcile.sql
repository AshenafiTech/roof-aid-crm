-- ============================================================
-- ROOF-AID CRM — M4 Stage 3: sms_logs status reconcile + MMS
--
-- Why: live data shows two parallel status columns:
--   - status         (CHECK in 014, written by lib/sms/actions.ts)
--   - delivery_status (no CHECK, written by an undocumented send_sms RPC)
-- Sample of 24 rows: 14 have status=NULL, delivery_status='queued'.
-- Plus 9 message.finalized webhooks were dropped because the
-- handler didn't know about Telnyx's 'delivery_unconfirmed' state.
--
-- This migration:
--   1. Backfills status from delivery_status so rows are no longer
--      stuck at NULL.
--   2. Expands the status CHECK to include 'delivery_unconfirmed'.
--   3. Adds a sync trigger so writes to either column propagate to
--      the other. Once all callers (incl. drift-installed RPCs) are
--      writing `status`, a follow-up migration drops delivery_status.
--   4. Adds media_urls for MMS support (capabilities already advertise it).
--   5. Restricts client-side inserts to direction='outbound'.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backfill: lift any orphaned delivery_status into status
-- ------------------------------------------------------------
UPDATE sms_logs
   SET status = delivery_status
 WHERE status IS NULL
   AND delivery_status IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Expand status CHECK
-- 'delivery_unconfirmed' is what Telnyx returns for messages it sent
-- but couldn't get a delivery receipt for (toll-free, some carriers).
-- Treating it as its own status keeps the UI honest instead of
-- showing a stale 'sent'.
-- ------------------------------------------------------------
ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_status_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_status_check
  CHECK (status IS NULL OR status IN (
    'queued',
    'sent',
    'delivered',
    'delivery_unconfirmed',
    'failed',
    'received'
  ));

-- Mirror the same constraint on delivery_status so the legacy column
-- can't drift back to free-form values during the transition.
ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_delivery_status_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN (
    'queued',
    'sent',
    'delivered',
    'delivery_unconfirmed',
    'failed',
    'received'
  ));

-- ------------------------------------------------------------
-- 3. Sync trigger: keep status and delivery_status mirrored.
-- Treats `status` as canonical. If the writer set only one of them,
-- the trigger fills the other. If they conflict, status wins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sms_logs_sync_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- INSERT path
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL AND NEW.delivery_status IS NOT NULL THEN
      NEW.status := NEW.delivery_status;
    ELSIF NEW.delivery_status IS NULL AND NEW.status IS NOT NULL THEN
      NEW.delivery_status := NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF TG_OP = 'UPDATE' THEN
    -- If only one column was changed in this UPDATE, propagate to the other.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status THEN
      NEW.delivery_status := NEW.status;
    ELSIF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := NEW.delivery_status;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_logs_sync_status_trg ON sms_logs;
CREATE TRIGGER sms_logs_sync_status_trg
BEFORE INSERT OR UPDATE OF status, delivery_status ON sms_logs
FOR EACH ROW EXECUTE FUNCTION sms_logs_sync_status();

COMMENT ON COLUMN sms_logs.delivery_status IS
  'DEPRECATED — kept for backward compat with the drift-installed send_sms RPC. A trigger keeps it mirrored with status. Will be dropped once all callers are migrated.';

-- ------------------------------------------------------------
-- 4. MMS support
-- tenant_phone_numbers.capabilities already advertises 'mms'; without
-- this column we couldn't store the inbound media even if the carrier
-- delivered it.
-- ------------------------------------------------------------
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

-- A row must have something — either text or media. Empty MMS-no-text
-- with empty body is allowed if media_urls is non-empty.
ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_body_or_media;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_body_or_media
  CHECK (
    coalesce(length(body), 0) > 0
    OR array_length(media_urls, 1) IS NOT NULL
  );

-- ------------------------------------------------------------
-- 5. Restrict client-side inserts to outbound
-- The webhook (service role bypasses RLS) writes inbound rows; an
-- authenticated client should never be able to forge them.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "sms_logs_insert" ON sms_logs;
CREATE POLICY "sms_logs_insert" ON sms_logs FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND direction = 'outbound'
  );

-- ------------------------------------------------------------
-- 6. Helpful index for unread-count queries (mobile + web badge)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sms_logs_inbound_unread
  ON sms_logs (tenant_id, prospect_id, created_at DESC)
  WHERE direction = 'inbound' AND read_at IS NULL;
