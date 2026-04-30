-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: can_call / can_message / mark_sms_read
-- ============================================================
-- These RPCs are the single source of truth for "may we contact this
-- prospect right now". Every Call / SMS button on every surface (web
-- softphone, web SMS thread, mobile SMS tab) calls one of these
-- before initiating.
--
-- ⚠️ DNC POLICY (matches client direction + M3-6 deviation):
--   DNC is INFORMATIONAL, not a hard block. The UI surfaces a
--   DncBanner so the agent sees the warning and takes responsibility.
--   These RPCs therefore do NOT return `allowed: false` for a DNC
--   flag. Hard-block reasons are limited to:
--     * not_found            (prospect doesn't exist)
--     * cross_tenant         (RLS perimeter)
--     * no_phone             (nothing to dial / text)
--     * outside_calling_hours (TCPA quiet-hours, can_call only)
--
-- Calling-hours is a separate TCPA requirement and STAYS a hard block.
-- ============================================================

CREATE OR REPLACE FUNCTION can_call(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_phones    TEXT[];
  v_tz        TEXT;
  v_hours     JSONB;
  v_now_local TIMESTAMP;
  v_dow       TEXT;
  v_today     JSONB;
BEGIN
  SELECT tenant_id, phones
    INTO v_tenant_id, v_phones
  FROM prospects WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  IF public.get_tenant_id() IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  -- DNC intentionally NOT a hard-block. Surfaced as `do_not_call_warning`
  -- in the verdict so the UI can decorate the call button (red border,
  -- "use judgment" tooltip, etc.) without disabling it.
  -- (Client may flip this later; if so, add the gate here and remove
  -- the warning field.)

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_phone');
  END IF;

  SELECT timezone, calling_hours INTO v_tz, v_hours
  FROM tenants WHERE id = v_tenant_id;

  v_now_local := (now() AT TIME ZONE v_tz);
  v_dow := lower(to_char(v_now_local, 'dy'));    -- mon, tue, wed, ...
  v_today := v_hours -> v_dow;

  IF v_today IS NULL OR v_today = 'null'::jsonb THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'outside_calling_hours',
      'today_hours', NULL, 'tz', v_tz,
      'do_not_call_warning', _prospect_dnc_flagged(p_prospect_id)
    );
  END IF;

  IF (v_now_local::time < (v_today->>'start')::time)
     OR (v_now_local::time >= (v_today->>'end')::time) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'outside_calling_hours',
      'today_hours', v_today, 'tz', v_tz,
      'do_not_call_warning', _prospect_dnc_flagged(p_prospect_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'ok',
    'do_not_call_warning', _prospect_dnc_flagged(p_prospect_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION can_message(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_phones    TEXT[];
BEGIN
  SELECT tenant_id, phones
    INTO v_tenant_id, v_phones
  FROM prospects WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;

  IF public.get_tenant_id() IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;

  -- DNC NOT blocking — see can_call notes above.

  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_phone');
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'ok',
    'do_not_call_warning', _prospect_dnc_flagged(p_prospect_id)
  );
END;
$$;

-- Tiny helper kept private (underscore prefix) — used by both verdicts.
CREATE OR REPLACE FUNCTION _prospect_dnc_flagged(p_prospect_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(do_not_call, false)
  FROM prospects WHERE id = p_prospect_id;
$$;

-- ── mark_sms_read ─────────────────────────────────────────────
-- Mobile fires this fire-and-forget when the SMS tab opens or when a
-- new inbound message arrives via Realtime. Tenant-scoped so users
-- can only mark their own tenant's messages.

CREATE OR REPLACE FUNCTION mark_sms_read(p_prospect_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE sms_logs
     SET read_at = now()
   WHERE prospect_id = p_prospect_id
     AND direction = 'inbound'
     AND read_at IS NULL
     AND tenant_id = public.get_tenant_id();
END;
$$;

GRANT EXECUTE ON FUNCTION can_call(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_sms_read(UUID) TO authenticated;
-- _prospect_dnc_flagged is a private helper — only callable from inside
-- the SECURITY DEFINER functions above (no GRANT to authenticated).
