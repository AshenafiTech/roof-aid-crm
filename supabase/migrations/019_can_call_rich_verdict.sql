-- ============================================================
-- ROOF-AID CRM — M4 Stage 5: rich can_call / can_message verdicts
--
-- Why: existing RPCs return only {allowed, reason}. The UI can't
-- show "Outside calling hours (08:00–20:00 America/Chicago)" without
-- a second round-trip. The can_call function also (a) used
-- to_char(..., 'dy') which is locale-dependent and silently breaks
-- on non-English servers, (b) didn't reject calls when the tenant
-- has zero active phone numbers, (c) didn't let super_admin help
-- across tenants.
--
-- Back-compat: callers reading verdict.allowed / verdict.reason
-- continue to work; new fields (today_hours, tz, dnc_at,
-- has_active_number) are additive.
-- ============================================================

CREATE OR REPLACE FUNCTION can_call(p_prospect_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   uuid;
  v_dnc         boolean;
  v_dnc_at      timestamptz;
  v_dnc_reason  text;
  v_phones      text[];
  v_tz          text;
  v_hours       jsonb;
  v_now_local   timestamp;
  v_dow_idx     int;
  v_dow_key     text;
  v_today       jsonb;
  v_role        text;
  v_caller_tid  uuid;
  v_has_number  boolean;
BEGIN
  SELECT tenant_id, do_not_call, do_not_call_at, do_not_call_reason, phones
    INTO v_tenant_id, v_dnc, v_dnc_at, v_dnc_reason, v_phones
    FROM prospects
   WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  -- Tenant scoping (super_admin bypasses)
  v_role := public.get_user_role();
  v_caller_tid := public.get_tenant_id();
  IF v_role <> 'super_admin' AND v_tenant_id <> v_caller_tid THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  -- Tenant settings + has-active-number check
  SELECT timezone, calling_hours
    INTO v_tz, v_hours
    FROM tenants
   WHERE id = v_tenant_id;

  SELECT EXISTS (
    SELECT 1 FROM tenant_phone_numbers
     WHERE tenant_id = v_tenant_id
       AND status = 'active'
       AND 'voice' = ANY(capabilities)
  ) INTO v_has_number;

  -- Locale-safe DOW (extract returns 0=Sun..6=Sat regardless of locale)
  v_now_local := (now() AT TIME ZONE v_tz);
  v_dow_idx   := extract(dow FROM v_now_local)::int;
  v_dow_key   := CASE v_dow_idx
                   WHEN 0 THEN 'sun'
                   WHEN 1 THEN 'mon'
                   WHEN 2 THEN 'tue'
                   WHEN 3 THEN 'wed'
                   WHEN 4 THEN 'thu'
                   WHEN 5 THEN 'fri'
                   WHEN 6 THEN 'sat'
                 END;
  v_today := v_hours -> v_dow_key;

  -- DNC takes precedence in the verdict, but we always include the
  -- contextual fields so the UI can render a rich tooltip even when
  -- showing an override-confirm dialog.
  IF v_dnc THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'dnc',
      'dnc_at',  v_dnc_at,
      'dnc_reason', v_dnc_reason,
      'tz', v_tz,
      'today_hours', v_today,
      'has_active_number', v_has_number
    );
  END IF;

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'no_phone',
      'tz', v_tz,
      'today_hours', v_today,
      'has_active_number', v_has_number
    );
  END IF;

  IF NOT v_has_number THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'tenant_has_no_voice_number',
      'tz', v_tz,
      'today_hours', v_today,
      'has_active_number', false
    );
  END IF;

  IF v_today IS NULL OR v_today = 'null'::jsonb THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'outside_calling_hours',
      'tz', v_tz,
      'today_hours', NULL,
      'has_active_number', v_has_number
    );
  END IF;

  IF (v_now_local::time <  (v_today->>'start')::time)
     OR (v_now_local::time >= (v_today->>'end')::time) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'outside_calling_hours',
      'tz', v_tz,
      'today_hours', v_today,
      'has_active_number', v_has_number
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason',  'ok',
    'tz', v_tz,
    'today_hours', v_today,
    'has_active_number', v_has_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION can_message(p_prospect_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   uuid;
  v_dnc         boolean;
  v_dnc_at      timestamptz;
  v_dnc_reason  text;
  v_phones      text[];
  v_role        text;
  v_caller_tid  uuid;
  v_has_number  boolean;
BEGIN
  SELECT tenant_id, do_not_call, do_not_call_at, do_not_call_reason, phones
    INTO v_tenant_id, v_dnc, v_dnc_at, v_dnc_reason, v_phones
    FROM prospects
   WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  v_role := public.get_user_role();
  v_caller_tid := public.get_tenant_id();
  IF v_role <> 'super_admin' AND v_tenant_id <> v_caller_tid THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM tenant_phone_numbers
     WHERE tenant_id = v_tenant_id
       AND status = 'active'
       AND 'sms' = ANY(capabilities)
  ) INTO v_has_number;

  IF v_dnc THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'dnc',
      'dnc_at',  v_dnc_at,
      'dnc_reason', v_dnc_reason,
      'has_active_number', v_has_number
    );
  END IF;

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'no_phone',
      'has_active_number', v_has_number
    );
  END IF;

  IF NOT v_has_number THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'tenant_has_no_sms_number',
      'has_active_number', false
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason',  'ok',
    'has_active_number', v_has_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION can_call(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION can_message(uuid) TO authenticated;
