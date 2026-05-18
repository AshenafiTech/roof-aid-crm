-- ============================================================
-- ROOF-AID CRM — M4 Stage 1.5: integrity constraints on phone numbers
--
-- Why: routing_rule.kind is unvalidated JSONB so a typo silently
-- falls through the webhook switch; e164 has no format check so a
-- bad row breaks the inbound tenantFromTo lookup; a primary number
-- can be flagged is_primary=true while status='released'; the
-- per-agent telnyx_extension can be empty string.
-- ============================================================

-- ------------------------------------------------------------
-- 1. tenant_phone_numbers.routing_rule.kind must be a known value.
-- The webhook dispatches inbound calls based on this; a typo
-- ('ringall' vs 'ring_all') would silently fall through.
-- ------------------------------------------------------------
ALTER TABLE tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tpn_routing_rule_kind_check;

ALTER TABLE tenant_phone_numbers
  ADD CONSTRAINT tpn_routing_rule_kind_check
  CHECK (
    routing_rule ? 'kind'
    AND routing_rule->>'kind' IN (
      'ring_all',
      'assigned_rep_first_then_all',
      'voicemail_only'
    )
  );

-- ------------------------------------------------------------
-- 2. E.164 format on the tenant's number.
-- A non-E.164 row would never match an inbound webhook's `to`,
-- effectively orphaning the number.
-- ------------------------------------------------------------
ALTER TABLE tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tpn_e164_format_check;

ALTER TABLE tenant_phone_numbers
  ADD CONSTRAINT tpn_e164_format_check
  CHECK (e164 ~ '^\+[1-9][0-9]{6,14}$');

-- ------------------------------------------------------------
-- 3. is_primary is only meaningful on active rows.
-- The partial unique index in 013 enforces "at most one primary"
-- but doesn't prevent is_primary=true on a released number, which
-- would leave a tenant with no usable primary.
-- ------------------------------------------------------------
ALTER TABLE tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tpn_is_primary_active_check;

ALTER TABLE tenant_phone_numbers
  ADD CONSTRAINT tpn_is_primary_active_check
  CHECK (
    is_primary = false
    OR status = 'active'
  );

-- ------------------------------------------------------------
-- 4. capabilities can only contain the values Telnyx returns.
-- ------------------------------------------------------------
ALTER TABLE tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tpn_capabilities_check;

ALTER TABLE tenant_phone_numbers
  ADD CONSTRAINT tpn_capabilities_check
  CHECK (capabilities <@ ARRAY['voice', 'sms', 'mms', 'fax', 'emergency']::text[]);

-- ------------------------------------------------------------
-- 5. users.telnyx_extension format check.
-- Numeric only, 3-6 digits — matches typical SIP extension shape.
-- An empty string today would pass the UNIQUE but break inbound
-- routing.
-- ------------------------------------------------------------
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_telnyx_extension_format;

ALTER TABLE users
  ADD CONSTRAINT users_telnyx_extension_format
  CHECK (telnyx_extension IS NULL OR telnyx_extension ~ '^[0-9]{3,6}$');

-- ------------------------------------------------------------
-- 6. tenants.timezone must be a valid IANA tz.
-- An invalid string makes can_call always throw at "now() AT TIME ZONE v_tz".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _is_valid_timezone(tz text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Use a fixed timestamp so the function is genuinely immutable.
  PERFORM '2000-01-01 00:00:00'::timestamp AT TIME ZONE tz;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_timezone_valid;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_timezone_valid
  CHECK (_is_valid_timezone(timezone));

-- ------------------------------------------------------------
-- 7. Helpful comments on confused/legacy fields
-- ------------------------------------------------------------
COMMENT ON COLUMN tenants.telnyx_app_id IS
  'DEPRECATED — tenants.telnyx_credential_connection_id is the per-tenant Telnyx Credentials Connection used by WebRTC. Drop in a future migration once code is cleaned up.';

COMMENT ON COLUMN tenants.telnyx_main_number IS
  'DEPRECATED — replaced by tenant_phone_numbers (see migration 013). Stale data may still be present. Read primary via: SELECT e164 FROM tenant_phone_numbers WHERE tenant_id = $1 AND is_primary AND status = ''active''.';

COMMENT ON COLUMN tenants.telnyx_credential_connection_id IS
  'Telnyx Credentials Connection ID (NOT a Voice/Call Control App ID). WebRTC clients mint /v2/telephony_credentials against this. If this matches the value of any tenant_phone_numbers.voice_app_id, the data is misconfigured and inbound calls will not route to WebRTC clients.';
