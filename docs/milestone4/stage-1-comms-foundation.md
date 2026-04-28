# Stage 1 — Communications Foundation

**Goal:** Lay the database, RPC, webhook, and Vault scaffolding that every subsequent M4 stage stands on. By the end, an empty webhook handler is live, both providers can send signed events to it, and the `can_call()` / `can_message()` RPCs return correct verdicts for any prospect.

**Outcome:** Stages 2–4 can each plug into the same scaffolding; nobody has to re-solve "where do call events get stored" or "where does a DNC check live".

**Estimated time:** 1.5 days

---

## 1. Schema migrations

Add three migrations under `supabase/migrations/`:

### `010_comms_schema_extensions.sql`

```sql
-- Tenant-level config
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS calling_hours JSONB NOT NULL DEFAULT '{
    "mon":{"start":"08:00","end":"20:00"},
    "tue":{"start":"08:00","end":"20:00"},
    "wed":{"start":"08:00","end":"20:00"},
    "thu":{"start":"08:00","end":"20:00"},
    "fri":{"start":"08:00","end":"20:00"},
    "sat":{"start":"09:00","end":"17:00"},
    "sun":null
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_disclosure_audio_url TEXT;

-- Per-agent extension for inbound routing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telnyx_extension TEXT UNIQUE;

-- Idempotency on every external event row
ALTER TABLE call_logs  ADD COLUMN IF NOT EXISTS provider_event_id TEXT UNIQUE;
ALTER TABLE sms_logs   ADD COLUMN IF NOT EXISTS provider_message_id TEXT UNIQUE;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider_message_id TEXT UNIQUE;

-- Audit trail for every webhook event we receive
CREATE TABLE webhook_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL CHECK (provider IN ('telnyx','sendgrid')),
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_ok BOOLEAN NOT NULL,
  processed_at TIMESTAMPTZ,
  process_error TEXT
);
CREATE INDEX webhook_events_recent ON webhook_events (received_at DESC);
```

### `011_can_call_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION can_call(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_dnc        BOOLEAN;
  v_phones     TEXT[];
  v_tz         TEXT;
  v_hours      JSONB;
  v_now_local  TIMESTAMP;
  v_dow        TEXT;
  v_today      JSONB;
BEGIN
  SELECT tenant_id, do_not_call, phones
    INTO v_tenant_id, v_dnc, v_phones
    FROM prospects WHERE id = p_prospect_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF current_setting('app.tenant_id', true)::uuid != v_tenant_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cross_tenant');
  END IF;
  IF v_dnc THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'dnc');
  END IF;
  IF v_phones IS NULL OR array_length(v_phones, 1) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_phone');
  END IF;

  SELECT timezone, calling_hours INTO v_tz, v_hours FROM tenants WHERE id = v_tenant_id;
  v_now_local := (now() AT TIME ZONE v_tz);
  v_dow := lower(to_char(v_now_local, 'dy'));   -- mon, tue, ...
  v_today := v_hours -> v_dow;

  IF v_today IS NULL OR v_today = 'null'::jsonb THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_calling_hours');
  END IF;

  IF (v_now_local::time < (v_today->>'start')::time)
     OR (v_now_local::time >= (v_today->>'end')::time) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_calling_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

-- Identical shape for messaging — DNC + has-phone, but NO calling-hours check.
-- The TCPA SMS quiet-hours rules differ; we apply them at the API boundary
-- in stage 3 instead of at the RPC.
CREATE OR REPLACE FUNCTION can_message(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID; v_dnc BOOLEAN; v_phones TEXT[];
BEGIN
  SELECT tenant_id, do_not_call, phones
    INTO v_tenant_id, v_dnc, v_phones
    FROM prospects WHERE id = p_prospect_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF current_setting('app.tenant_id', true)::uuid != v_tenant_id THEN
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

GRANT EXECUTE ON FUNCTION can_call(UUID), can_message(UUID) TO authenticated;
```

### `012_storage_call_recordings.sql`

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_owns_path_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM users WHERE id = auth.uid())
);
-- Mirror INSERT/UPDATE/DELETE policies same as SELECT.
```

---

## 2. Vault: signing secrets

Both webhooks must verify signatures **before** doing any work.

```sql
-- one-time, run via supabase dashboard or psql
SELECT vault.create_secret('TELNYX_PUBLIC_KEY',   '<paste from Telnyx portal>');
SELECT vault.create_secret('SENDGRID_PUBLIC_KEY', '<paste from SendGrid event-webhook settings>');
SELECT vault.create_secret('TELNYX_API_KEY',      '<paste>');
SELECT vault.create_secret('SENDGRID_API_KEY',    '<paste>');
```

The Edge Functions read these via `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1` (service role only). **Never** put these in `.env` — they end up in the build cache.

---

## 3. Webhook skeletons

### `supabase/functions/telnyx-webhook/index.ts`

```ts
import { serve } from 'https://deno.land/std/http/server.ts';
import { verifyTelnyxSignature } from '../_shared/telnyx-signature.ts';
import { admin } from '../_shared/supabase-admin.ts';

serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get('telnyx-signature-ed25519');
  const ts   = req.headers.get('telnyx-timestamp');

  const ok = await verifyTelnyxSignature(body, sig, ts);
  await admin.from('webhook_events').insert({
    provider: 'telnyx',
    event_type: JSON.parse(body)?.data?.event_type ?? 'unknown',
    payload: JSON.parse(body),
    signature_ok: ok,
  });
  if (!ok) return new Response('bad signature', { status: 401 });

  // Dispatch happens in Stage 2 (call events) and Stage 3 (sms events).
  // Stage 1 just records and 200s.
  return new Response('ok', { status: 200 });
});
```

### `supabase/functions/sendgrid-webhook/index.ts`

Same shape, different signature algorithm (ECDSA on `X-Twilio-Email-Event-Webhook-Signature`).

### `supabase/functions/_shared/telnyx-signature.ts`

```ts
import { decode as b64decode } from 'https://deno.land/std/encoding/base64.ts';

export async function verifyTelnyxSignature(
  body: string, sig: string | null, ts: string | null,
): Promise<boolean> {
  if (!sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;  // 5-min window
  const pub = await getSecret('TELNYX_PUBLIC_KEY');
  const key = await crypto.subtle.importKey(
    'raw', b64decode(pub), { name: 'Ed25519' }, false, ['verify']
  );
  const data = new TextEncoder().encode(`${ts}|${body}`);
  return crypto.subtle.verify('Ed25519', key, b64decode(sig), data);
}
```

---

## 4. Wire-up tasks

| Task | Owner | Verify |
|------|-------|--------|
| Run migrations 010–012 against dev DB | Dev | `\d tenants` shows new columns; `SELECT can_call('<seed prospect uuid>')` returns `{allowed:true}` |
| Insert Vault secrets | Dev | `SELECT decrypted_secret FROM vault.decrypted_secrets` returns 4 rows |
| Deploy `telnyx-webhook` and `sendgrid-webhook` Edge Functions | Dev | `supabase functions list` shows both |
| Configure webhook URLs in Telnyx + SendGrid portals | Dev | Send a test event from each portal → `webhook_events` table grows |
| Add `telnyx_extension` to seed agents (e.g. `1001`, `1002`) | Dev | `SELECT id, telnyx_extension FROM users` shows values |
| Create `call-recordings` bucket via migration | Dev | Bucket visible in dashboard, RLS shows path-prefix policy |

---

## 5. Done when

- [ ] Forging a webhook payload with a wrong signature returns 401 and inserts a row with `signature_ok = false`
- [ ] Re-sending the same valid Telnyx event 3× via `curl --data-raw` results in 3 rows in `webhook_events` (not deduped — that's the audit) but only 0 rows in `call_logs` (no handler yet)
- [ ] `SELECT can_call('<seeded prospect>')` returns `{allowed: true, reason: 'ok'}` during business hours, `{allowed: false, reason: 'outside_calling_hours'}` after 8pm
- [ ] Toggling `prospects.do_not_call = true` flips the verdict to `{allowed: false, reason: 'dnc'}` immediately

Once those four checks pass, Stage 2 can plug a real handler into the dispatcher. Nothing in M4 builds correctly without this foundation in place.
