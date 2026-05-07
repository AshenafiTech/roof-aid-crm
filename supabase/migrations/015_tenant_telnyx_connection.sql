-- ============================================================
-- ROOF-AID CRM — M4 Stage 2: per-tenant Telnyx Credentials Connection
-- Each tenant owns its own SIP/WebRTC Credentials Connection on
-- Telnyx. WebRTC credentials minted against this connection are
-- structurally scoped to the tenant — calls to Tenant A's numbers
-- can never ring Tenant B's clients.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS telnyx_credential_connection_id text;

CREATE INDEX IF NOT EXISTS tenants_telnyx_credential_connection_id_key
  ON tenants (telnyx_credential_connection_id)
  WHERE telnyx_credential_connection_id IS NOT NULL;

COMMENT ON COLUMN tenants.telnyx_credential_connection_id IS
  'Telnyx Credentials Connection ID for this tenant. Created at onboarding. '
  'WebRTC clients mint /v2/telephony_credentials against this connection so '
  'inbound calls and outbound dial routing are tenant-isolated.';
