-- ============================================================
-- ROOF-AID CRM — M4 Stage 3: Realtime publication + lookup helpers
-- ============================================================
-- Mobile and web both subscribe to per-prospect SMS threads via
-- Supabase Realtime. The publication has to know about sms_logs.
--
-- Plus two SECURITY DEFINER lookup helpers that the inbound SMS
-- handler uses to resolve "to-number → tenant" and "from-number →
-- prospect" without writing two ad-hoc SELECTs in the Edge Function.
-- ============================================================

-- ── 1. Enable Realtime on sms_logs ───────────────────────────
-- Wrapped in a DO block so re-running the migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sms_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs';
  END IF;
END $$;

-- ── 2. Tenant lookup by Telnyx number ────────────────────────
-- Inbound SMS arrive on the tenant's main number (tenants.telnyx_main_number).
-- The webhook needs to resolve which tenant that is so it can scope the
-- new row + notification correctly.
CREATE OR REPLACE FUNCTION tenant_by_telnyx_number(p_number TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants
  WHERE telnyx_main_number = p_number
  LIMIT 1
$$;

-- ── 3. Prospect lookup by sender phone ───────────────────────
-- prospects.phones is a text[]. Match the inbound sender against any of
-- the array values to find the matching prospect within the tenant.
CREATE OR REPLACE FUNCTION prospect_by_phone(p_tenant_id UUID, p_phone TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM prospects
  WHERE tenant_id = p_tenant_id
    AND p_phone = ANY(phones)
  LIMIT 1
$$;

-- These helpers are intentionally NOT granted to authenticated — they're
-- called from the SECURITY DEFINER context inside the Edge Function via
-- the service-role admin client.
