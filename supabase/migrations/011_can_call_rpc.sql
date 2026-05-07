-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: can_call() / can_message() RPCs
-- Single source of truth for "may we contact this prospect now?"
-- Every dial/send site (web + mobile) calls these before initiating.
-- ============================================================

-- ------------------------------------------------------------
-- can_call: DNC + has-phone + within calling hours (tenant tz)
-- Returns: { allowed: bool, reason: text }
-- Reasons: ok | not_found | cross_tenant | dnc | no_phone | outside_calling_hours
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_call(p_prospect_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_dnc        boolean;
  v_phones     text[];
  v_tz         text;
  v_hours      jsonb;
  v_now_local  timestamp;
  v_dow        text;
  v_today      jsonb;
BEGIN
  SELECT tenant_id, do_not_call, phones
    INTO v_tenant_id, v_dnc, v_phones
    FROM prospects
   WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  -- Tenant scoping: caller must be in the prospect's tenant
  IF v_tenant_id <> public.get_tenant_id() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  IF v_dnc THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'dnc');
  END IF;

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_phone');
  END IF;

  -- Calling hours in tenant timezone
  SELECT timezone, calling_hours
    INTO v_tz, v_hours
    FROM tenants
   WHERE id = v_tenant_id;

  v_now_local := (now() AT TIME ZONE v_tz);
  v_dow       := lower(to_char(v_now_local, 'dy'));   -- mon, tue, wed, ...
  v_today     := v_hours -> v_dow;

  IF v_today IS NULL OR v_today = 'null'::jsonb THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_calling_hours');
  END IF;

  IF (v_now_local::time <  (v_today->>'start')::time)
     OR (v_now_local::time >= (v_today->>'end')::time) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_calling_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

-- ------------------------------------------------------------
-- can_message: DNC + has-phone (NO calling-hours check)
-- TCPA SMS quiet-hours rules differ; applied at API boundary in Stage 3.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_message(p_prospect_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_dnc       boolean;
  v_phones    text[];
BEGIN
  SELECT tenant_id, do_not_call, phones
    INTO v_tenant_id, v_dnc, v_phones
    FROM prospects
   WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  IF v_tenant_id <> public.get_tenant_id() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  IF v_dnc THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'dnc');
  END IF;

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_phone');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION can_call(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION can_message(uuid) TO authenticated;
