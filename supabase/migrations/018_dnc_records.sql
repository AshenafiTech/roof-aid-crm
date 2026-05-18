-- ============================================================
-- ROOF-AID CRM — M4 Stage 5: dnc_records audit table
--
-- Why: README §4 lists `dnc_records` as a pre-existing M1 table, but
-- it was never actually created. Today the *only* DNC trace is the
-- boolean prospects.do_not_call + reason + timestamp — which gets
-- overwritten on the next event. For TCPA compliance we need an
-- immutable per-event audit trail proving when each DNC was applied,
-- who/what triggered it, and the message body that caused it (for
-- STOP-keyword cases).
-- ============================================================

CREATE TABLE IF NOT EXISTS dnc_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id  uuid REFERENCES prospects(id) ON DELETE SET NULL,

  -- Source of the DNC event
  source       text NOT NULL CHECK (source IN (
    'sms_stop_keyword',     -- inbound SMS matched STOP/STOPALL/UNSUBSCRIBE/...
    'agent_request',        -- agent flipped the toggle in the UI
    'homeowner_request',    -- explicit "do not call" during a call
    'import',               -- DNC list import
    'national_registry',    -- federal Do Not Call list match
    'admin_action',         -- owner/admin manually flagged
    'auto_compliance'       -- automated compliance rule (e.g., 7+ unanswered calls)
  )),

  -- Free-form context
  reason       text,                           -- human-readable summary
  message_body text,                           -- the SMS that triggered STOP, if any
  phone_number text,                           -- E.164 the event applied to
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Who flagged it (NULL for automated/webhook-driven events)
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS dnc_records_tenant_recent
  ON dnc_records (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dnc_records_prospect
  ON dnc_records (prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dnc_records_phone
  ON dnc_records (tenant_id, phone_number)
  WHERE phone_number IS NOT NULL;

-- ------------------------------------------------------------
-- RLS: tenant scoped, append-only from the application's POV.
-- Service role inserts the rows from the webhook; clients can only
-- read.
-- ------------------------------------------------------------
ALTER TABLE dnc_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dnc_records_select" ON dnc_records FOR SELECT TO authenticated
  USING (tenant_id = public.get_tenant_id());

-- Agents can record agent_request / homeowner_request DNCs from the UI;
-- the webhook (service role) bypasses RLS for sms_stop_keyword.
CREATE POLICY "dnc_records_insert" ON dnc_records FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND source IN ('agent_request', 'homeowner_request', 'admin_action')
    AND created_by = auth.uid()
  );

-- No update / delete from clients — these are immutable audit rows.

-- ------------------------------------------------------------
-- Convenience: realtime so admin compliance dashboards refresh live
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dnc_records'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE dnc_records';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Trigger: every dnc_records insert mirrors into prospects.do_not_call
-- (write-through) so the existing UI keeps working without code
-- changes. The audit row is the source of truth; the boolean is a
-- denormalized cache.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION dnc_records_apply_to_prospect() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.prospect_id IS NOT NULL THEN
    UPDATE prospects
       SET do_not_call        = true,
           do_not_call_reason = COALESCE(NEW.reason, NEW.source),
           do_not_call_at     = NEW.created_at
     WHERE id = NEW.prospect_id
       AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dnc_records_apply_to_prospect_trg ON dnc_records;
CREATE TRIGGER dnc_records_apply_to_prospect_trg
AFTER INSERT ON dnc_records
FOR EACH ROW EXECUTE FUNCTION dnc_records_apply_to_prospect();
