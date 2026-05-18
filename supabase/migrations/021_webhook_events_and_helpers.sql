-- ============================================================
-- ROOF-AID CRM — M4: webhook_events ergonomics + drift helpers
--
-- Why:
--   - webhook_events.payload->'data'->>'id' is the provider's event
--     id. Querying it requires a full scan because it isn't projected
--     to a column. We add a generated column + index so dedup
--     investigations and replay tooling are fast.
--   - Add a tiny helper for the inbound call handler to look up an
--     online agent for a tenant (by extension) without each handler
--     re-implementing the join.
--   - A view that summarises tenant comms readiness so the dashboard
--     "missing setup" banner is one query.
-- ============================================================

-- ------------------------------------------------------------
-- 1. provider_event_id as a generated column
-- ------------------------------------------------------------
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS provider_event_id text
    GENERATED ALWAYS AS (payload->'data'->>'id') STORED;

CREATE INDEX IF NOT EXISTS webhook_events_provider_event_id
  ON webhook_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Tenant comms readiness view
-- Used by the "missing setup" dashboard banner and by an
-- onboarding-completeness check.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tenant_comms_readiness AS
SELECT
  t.id   AS tenant_id,
  t.name AS tenant_name,
  t.timezone,
  EXISTS (
    SELECT 1 FROM tenant_phone_numbers tpn
     WHERE tpn.tenant_id = t.id
       AND tpn.status = 'active'
       AND 'voice' = ANY(tpn.capabilities)
  ) AS has_voice_number,
  EXISTS (
    SELECT 1 FROM tenant_phone_numbers tpn
     WHERE tpn.tenant_id = t.id
       AND tpn.status = 'active'
       AND 'sms' = ANY(tpn.capabilities)
  ) AS has_sms_number,
  t.telnyx_credential_connection_id IS NOT NULL AS has_credential_connection,
  (
    SELECT count(*) FROM users u
     WHERE u.tenant_id = t.id
       AND u.telnyx_extension IS NOT NULL
  ) AS users_with_extension
FROM tenants t;

GRANT SELECT ON tenant_comms_readiness TO authenticated;

-- ------------------------------------------------------------
-- 3. Helper RPC: find an agent's user_id by tenant + extension.
-- Used by the inbound-call handler to route to the assigned rep.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_by_extension(p_tenant_id uuid, p_extension text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users
   WHERE tenant_id = p_tenant_id
     AND telnyx_extension = p_extension
     AND is_active = true
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION user_by_extension(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 4. Activities insert policy — calls/SMS handlers want to write
-- audit rows under the tenant context. Today there's only a SELECT
-- policy; service role bypasses RLS so it works, but make the intent
-- explicit so the next dev doesn't try to rebuild it client-side.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "activities_insert" ON activities;
CREATE POLICY "activities_insert" ON activities FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_tenant_id()
  );

COMMENT ON TABLE activities IS
  'Audit log. Service role inserts from webhooks; clients may insert audit rows under their own tenant via the policy. Never updated.';
