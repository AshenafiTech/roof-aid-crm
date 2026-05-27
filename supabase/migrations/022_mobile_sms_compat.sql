-- ============================================================
-- ROOF-AID CRM — M4 Stage 7 backend: mobile-SMS compatibility
-- ============================================================
-- This migration formalises three pieces that the mobile branch
-- (`feat/m4-mobile-sms`) depends on. Each was previously drift-installed
-- on the dev DB but missing from the formal migration history; without
-- them a fresh DB (CI / staging / new dev clone) breaks the mobile flow.
--
--   1. sms_logs.read_at column        (mobile unread badge)
--   2. mark_sms_read(uuid) RPC        (called fire-and-forget on tab open)
--   3. send_sms(uuid, text) RPC       (mobile's outbound entry point)
--
-- Strictly additive — does not alter or replace anything from migrations
-- 001-021.
--
-- ⚠️ DNC POLICY (matches the M3-6 client deviation, confirmed by Robel):
--   DNC is INFORMATIONAL, not a hard block. The page-level DncBanner
--   surfaces the warning; the agent decides whether to proceed and takes
--   responsibility. The web's can_message rich verdict (migration 019)
--   correctly returns `allowed:false, reason:'dnc'` so server-side
--   enforcement remains a single source of truth — but mobile's send
--   path tolerates the DNC reason and proceeds anyway. All other
--   `allowed:false` reasons (no_phone, cross_tenant, tenant_has_no_sms_number,
--   not_found) still hard-block.
-- ============================================================

-- pg_net powers the fire-and-forget POST to Telnyx. No-op if it's already
-- enabled (Supabase trusted extension since 2023).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- 1. read_at column — required by mobile's unread-badge logic
-- (the column was drift-installed on legacy DBs before 017 referenced
-- it; this is its formal definition. On fresh installs both the column
-- and its companion index land here.)
-- ------------------------------------------------------------
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Index for unread-count queries (mobile + web badge). Originally
-- defined in 017_sms_logs_status_reconcile.sql; moved here so it sits
-- in the same migration as the column it depends on.
CREATE INDEX IF NOT EXISTS sms_logs_inbound_unread
  ON sms_logs (tenant_id, prospect_id, created_at DESC)
  WHERE direction = 'inbound' AND read_at IS NULL;

-- ------------------------------------------------------------
-- 2. mark_sms_read RPC — tenant-scoped, idempotent
-- Mobile fires this on SMS-tab open and on every Realtime update.
-- SECURITY INVOKER so RLS still applies; the explicit tenant_id filter
-- is belt-and-suspenders for cross-tenant safety.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_sms_read(p_prospect_id uuid)
RETURNS void
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

GRANT EXECUTE ON FUNCTION mark_sms_read(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3. send_sms RPC — mobile's outbound entry point
--
-- Behavioural contract (matches mobile-sms-implementation.md):
--   - Inserts a `queued` outbound row in sms_logs and returns its id
--   - Resolves the from-number from tenant_phone_numbers (primary first,
--     then any active SMS-capable number)
--   - Fires the Telnyx Messaging API call asynchronously via pg_net
--   - The caller sees the queued row immediately via Realtime; the
--     telnyx-webhook flips status when message.sent / message.finalized
--     arrives (sms-handlers.ts handles both phases — see Phase B note)
--
-- DNC handling: calls can_message() but tolerates `reason='dnc'` per
-- client policy. All other rejection reasons re-raise as
-- `sms_not_allowed: <reason>`.
--
-- Pre-requisites:
--   * vault.decrypted_secrets row named 'TELNYX_API_KEY'
--   * tenant_phone_numbers row with status='active' and 'sms' in
--     capabilities for the prospect's tenant
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_sms(p_prospect_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verdict      jsonb;
  v_reason       text;
  v_tenant_id    uuid;
  v_to           text;
  v_phone_id     uuid;
  v_from         text;
  v_api_key      text;
  v_log_id       uuid;
  v_request_id   bigint;
BEGIN
  -- 1. Permission check. DNC NOT a hard block per client policy.
  v_verdict := can_message(p_prospect_id);
  v_reason  := v_verdict->>'reason';
  IF NOT (v_verdict->>'allowed')::boolean AND v_reason IS DISTINCT FROM 'dnc' THEN
    RAISE EXCEPTION 'sms_not_allowed: %', v_reason;
  END IF;

  -- 2. Resolve send context.
  SELECT tenant_id, phones[1]
    INTO v_tenant_id, v_to
    FROM prospects
   WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'prospect_not_found';
  END IF;

  -- Pick the tenant's primary active SMS-capable number. Falls back to
  -- any active SMS number if no `is_primary=true` row exists.
  SELECT id, e164
    INTO v_phone_id, v_from
    FROM tenant_phone_numbers
   WHERE tenant_id = v_tenant_id
     AND status = 'active'
     AND 'sms' = ANY(capabilities)
   ORDER BY is_primary DESC, created_at ASC
   LIMIT 1;

  IF v_phone_id IS NULL THEN
    RAISE EXCEPTION 'tenant_has_no_sms_number';
  END IF;

  SELECT decrypted_secret
    INTO v_api_key
    FROM vault.decrypted_secrets
   WHERE name = 'TELNYX_API_KEY';
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'TELNYX_API_KEY_missing: SELECT vault.create_secret(''<value>'', ''TELNYX_API_KEY'')';
  END IF;

  -- 3. Insert the queued row. Realtime broadcasts this to subscribers
  -- immediately. provider_message_id is left NULL — the telnyx-webhook
  -- stamps it when message.sent / message.finalized arrives (Phase B
  -- match in handleOutboundSmsStatus, see the comment in sms-handlers.ts).
  --
  -- We write `status` (canonical column per migration 017); the trigger
  -- mirrors it to `delivery_status` for the legacy mobile reader.
  INSERT INTO sms_logs (
    tenant_id, prospect_id, agent_id, direction,
    body, status, from_number, to_number,
    tenant_phone_number_id, segments
  ) VALUES (
    v_tenant_id, p_prospect_id, auth.uid(), 'outbound',
    p_body, 'queued', v_from, v_to,
    v_phone_id, 1
  )
  RETURNING id INTO v_log_id;

  -- 4. Fire-and-forget POST to Telnyx. The response lands in
  -- net._http_response asynchronously; we don't poll it. The webhook
  -- delivers the authoritative state via message.sent /
  -- message.finalized.
  SELECT net.http_post(
    url     := 'https://api.telnyx.com/v2/messages',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from', v_from,
      'to',   v_to,
      'text', p_body
    )
  ) INTO v_request_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_sms(uuid, text) TO authenticated;
