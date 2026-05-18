-- ============================================================
-- ROOF-AID CRM — M4 Stage 1.5: per-tenant phone numbers
-- Each tenant owns 1+ Telnyx DIDs. All numbers attach to the
-- platform-wide Roof-Aid Messaging Profile + Voice App, so
-- inbound events resolve back to a tenant via the dialed `to`.
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_phone_numbers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Telnyx side
  telnyx_number_id     text NOT NULL UNIQUE,
  e164                 text NOT NULL UNIQUE,
  capabilities         text[] NOT NULL DEFAULT '{}',
  messaging_profile_id text,
  voice_app_id         text,

  -- Roof-Aid side
  label        text NOT NULL DEFAULT 'Main',
  is_primary   boolean NOT NULL DEFAULT false,
  routing_rule jsonb NOT NULL DEFAULT '{
    "kind": "ring_all",
    "voicemail_after_seconds": 25
  }'::jsonb,

  -- Lifecycle
  status       text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'released')),
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL
);

-- One primary per tenant (at most), only among active rows
CREATE UNIQUE INDEX IF NOT EXISTS tenant_phone_numbers_one_primary
  ON tenant_phone_numbers (tenant_id)
  WHERE is_primary = true AND status = 'active';

-- Inbound webhook lookup: resolve tenant from dialed `to`
CREATE INDEX IF NOT EXISTS tenant_phone_numbers_e164_active
  ON tenant_phone_numbers (e164)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS tenant_phone_numbers_tenant
  ON tenant_phone_numbers (tenant_id, status);

-- ------------------------------------------------------------
-- RLS — tenant scoped; only owners/admins can write
-- ------------------------------------------------------------
ALTER TABLE tenant_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpn_select" ON tenant_phone_numbers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "tpn_insert" ON tenant_phone_numbers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'super_admin')
  );

CREATE POLICY "tpn_update" ON tenant_phone_numbers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'super_admin')
  );

-- DELETE forbidden — release a number via status='released' so log
-- entries that reference it stay valid. Hard delete only via service role.

-- ------------------------------------------------------------
-- Stamp the tenant number on log rows for per-number rollups
-- ------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS tenant_phone_number_id uuid
    REFERENCES tenant_phone_numbers(id) ON DELETE SET NULL;

ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS tenant_phone_number_id uuid
    REFERENCES tenant_phone_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS call_logs_per_number
  ON call_logs (tenant_phone_number_id, created_at DESC)
  WHERE tenant_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_logs_per_number
  ON sms_logs (tenant_phone_number_id, created_at DESC)
  WHERE tenant_phone_number_id IS NOT NULL;
