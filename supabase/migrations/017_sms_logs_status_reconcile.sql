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
-- 1. Expand status CHECK
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

-- ------------------------------------------------------------
-- 2. Drift cleanup — only runs on legacy DBs where an out-of-band
-- send_sms RPC added a parallel `delivery_status` column.
-- On a clean install this block is a no-op so the migration applies
-- cleanly to fresh projects.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name  = 'sms_logs'
       AND column_name = 'delivery_status'
  ) THEN
    -- 2a. Backfill: lift any orphaned delivery_status into status
    UPDATE sms_logs
       SET status = delivery_status
     WHERE status IS NULL
       AND delivery_status IS NOT NULL;

    -- 2b. Mirror the status CHECK onto the legacy column.
    EXECUTE 'ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_delivery_status_check';
    EXECUTE $cc$
      ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_delivery_status_check
        CHECK (delivery_status IS NULL OR delivery_status IN (
          'queued','sent','delivered','delivery_unconfirmed','failed','received'
        ))
    $cc$;

    -- 2c. Sync trigger: keep status and delivery_status mirrored.
    --     status is canonical; if a writer set only one, fill the other.
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION sms_logs_sync_status() RETURNS TRIGGER
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.status IS NULL AND NEW.delivery_status IS NOT NULL THEN
            NEW.status := NEW.delivery_status;
          ELSIF NEW.delivery_status IS NULL AND NEW.status IS NOT NULL THEN
            NEW.delivery_status := NEW.status;
          END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' THEN
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
      $body$
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS sms_logs_sync_status_trg ON sms_logs';
    EXECUTE 'CREATE TRIGGER sms_logs_sync_status_trg
             BEFORE INSERT OR UPDATE OF status, delivery_status ON sms_logs
             FOR EACH ROW EXECUTE FUNCTION sms_logs_sync_status()';

    EXECUTE $cm$
      COMMENT ON COLUMN sms_logs.delivery_status IS
        'DEPRECATED — kept for backward compat with the drift-installed send_sms RPC. A trigger keeps it mirrored with status. Will be dropped once all callers are migrated.'
    $cm$;
  END IF;
END $$;

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

-- NOTE: the sms_logs_inbound_unread index that used to live here was moved
-- to migration 022_mobile_sms_compat.sql, which is where `read_at` is
-- formally defined. On legacy DBs the column was drift-added before this
-- migration ran; on fresh DBs the column doesn't exist until 022.
