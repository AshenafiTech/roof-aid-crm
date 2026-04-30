-- ============================================================
-- ROOF-AID CRM — M4 Stage 3: send_sms RPC
-- ============================================================
-- Single entry point for outbound SMS from any client (mobile, web).
--
--   1. Calls can_message() — DNC is INFORMATIONAL not blocking.
--   2. Resolves the tenant's Telnyx "from" number.
--   3. Inserts a queued row in sms_logs and returns its id.
--   4. Fires the Telnyx Messaging API call asynchronously via pg_net.
--
-- The RPC returns within a few ms — Telnyx's `message.sent` /
-- `message.delivered` / `message.failed` webhooks update the row's
-- delivery_status and stamp telnyx_message_id (handled by the
-- telnyx-webhook Edge Function).
--
-- ⚠️ Pre-requisites the user must configure once per project:
--   * pg_net extension enabled (default on Supabase)
--   * vault.decrypted_secrets row named 'TELNYX_API_KEY'
--   * Either:
--       - vault.decrypted_secrets row named 'TELNYX_MESSAGING_PROFILE_ID'
--         (preferred — Telnyx auto-picks the from-number from the
--         messaging profile's pool, so per-tenant attachment isn't
--         required), OR
--       - tenants.telnyx_main_number set for any tenant that will send
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION send_sms(p_prospect_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verdict       JSONB;
  v_tenant_id     UUID;
  v_to            TEXT;
  v_from          TEXT;
  v_msg_profile   TEXT;
  v_api_key       TEXT;
  v_log_id        UUID;
  v_request_id    BIGINT;
  v_telnyx_body   JSONB;
BEGIN
  -- 1. Permission check (DNC NOT a hard block — see can_message)
  v_verdict := can_message(p_prospect_id);
  IF NOT (v_verdict->>'allowed')::boolean THEN
    RAISE EXCEPTION 'sms_not_allowed: %', v_verdict->>'reason';
  END IF;

  -- 2. Resolve send context.
  --
  --   Preferred path: a TELNYX_MESSAGING_PROFILE_ID secret in Vault.
  --   Telnyx auto-picks any number on that profile's pool, so a tenant
  --   doesn't need a specific number attached to anything.
  --
  --   Fallback path: tenants.telnyx_main_number — used only if no
  --   messaging profile is configured. Requires the number to be on
  --   a messaging profile inside Telnyx (else Telnyx returns 10004).
  --
  --   We still record from_number on the sms_logs row when known so
  --   the inbound matcher can find replies; if Telnyx ends up sending
  --   from a different number on the profile, handle-sms-status stamps
  --   the real number on the `message.sent` event.
  SELECT tenant_id, phones[1] INTO v_tenant_id, v_to
    FROM prospects WHERE id = p_prospect_id;

  SELECT decrypted_secret INTO v_msg_profile
    FROM vault.decrypted_secrets WHERE name = 'TELNYX_MESSAGING_PROFILE_ID';

  SELECT telnyx_main_number INTO v_from
    FROM tenants WHERE id = v_tenant_id;

  IF v_msg_profile IS NULL AND (v_from IS NULL OR v_from = '') THEN
    RAISE EXCEPTION
      'no_send_context: set vault.TELNYX_MESSAGING_PROFILE_ID or tenants.telnyx_main_number';
  END IF;

  SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets WHERE name = 'TELNYX_API_KEY';
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'TELNYX_API_KEY_missing: SELECT vault.create_secret(''<value>'', ''TELNYX_API_KEY'')';
  END IF;

  -- 3. Insert queued row (Realtime broadcasts this to subscribers immediately)
  INSERT INTO sms_logs (
    tenant_id, prospect_id, agent_id, direction, body,
    delivery_status, from_number, to_number, sent_at
  ) VALUES (
    v_tenant_id, p_prospect_id, auth.uid(), 'outbound', p_body,
    'queued', v_from, v_to, now()
  )
  RETURNING id INTO v_log_id;

  -- 4. Build the Telnyx request body. Prefer messaging_profile_id when
  -- available (more flexible). When using a specific from-number too,
  -- include it as a hint so Telnyx prefers it if it's on the pool.
  IF v_msg_profile IS NOT NULL THEN
    v_telnyx_body := jsonb_build_object(
      'messaging_profile_id', v_msg_profile,
      'to',   v_to,
      'text', p_body
    );
  ELSE
    v_telnyx_body := jsonb_build_object(
      'from', v_from,
      'to',   v_to,
      'text', p_body
    );
  END IF;

  -- 5. Fire-and-forget POST. pg_net returns a request_id; the response
  -- lands in net._http_response asynchronously. We don't poll it —
  -- Telnyx's outbound webhooks (`message.sent` / `message.delivered` /
  -- `message.failed`) drive status updates back via telnyx-webhook.
  SELECT net.http_post(
    url     := 'https://api.telnyx.com/v2/messages',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type',  'application/json'
    ),
    body    := v_telnyx_body
  ) INTO v_request_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_sms(UUID, TEXT) TO authenticated;

-- pg_net publishes its tables under the `net` schema. authenticated
-- clients don't need any access to it — only the SECURITY DEFINER
-- function above touches it.
