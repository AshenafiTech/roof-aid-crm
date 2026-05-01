# Step 2 — `telnyx-webhook` Edge Function (skeleton)

**Date:** 2026-04-30
**Stage:** M4 Stage 1 — Communications Foundation (M4-5)
**Files added:**
- `supabase/functions/_shared/supabase-admin.ts` — service-role client factory
- `supabase/functions/_shared/telnyx-signature.ts` — Ed25519 signature verifier
- `supabase/functions/telnyx-webhook/index.ts` — main handler

## Purpose

Stand up a single Edge Function that receives every Telnyx webhook
(`call.*` and `message.*`), verifies its Ed25519 signature, audits the
event to `webhook_events`, and returns 200 within the 5-second window
Telnyx allows before retry.

This is the **skeleton** — it has no real call/SMS handlers yet. Stage 2
plugs in call lifecycle (initiated/answered/hangup), Stage 3 plugs in
SMS receive + STOP-keyword auto-DNC.

## What it does today

1. Reads the raw request body (signature is over the raw bytes — never
   re-stringify JSON before verifying)
2. Pulls `telnyx-signature-ed25519` and `telnyx-timestamp` headers
3. Verifies the signature against `TELNYX_PUBLIC_KEY` (Edge Function
   secret), with a 5-minute replay window
4. Inserts every event — verified or rejected — into `webhook_events`
   with `signature_ok` set accordingly. Audits live even when handlers
   crash later, so forensics never lose a payload.
5. Returns `401` with a `reason` for forged/stale/unsigned events
6. For valid events, runs a placeholder dispatcher and returns
   `{ ok: true }` 200

## Deployment

```bash
~/bin/supabase-new functions deploy telnyx-webhook \
  --no-verify-jwt --use-api
```

- `--no-verify-jwt` because Telnyx authenticates via Ed25519 signature,
  not Supabase JWT — JWT verification would 401 every webhook.
- `--use-api` bundles server-side without needing local Docker.

The function lives at:
```
https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook
```

This URL is already configured in the Telnyx portal:
- Messaging Profile `Roof-Aid` → Inbound Webhook URL
- Voice Call Control App `Roof-Aid CRM` → Webhook URL

## Edge Function secrets set

```bash
supabase secrets set --project-ref ivmfmpscdimyepbvrbee \
  TELNYX_PUBLIC_KEY=<44-char base64 Ed25519 public key> \
  TELNYX_API_KEY=<58-char Telnyx V2 API key>
```

`TELNYX_API_KEY` isn't read by this skeleton but is set now so Stage 2/3
handlers can call Telnyx APIs (e.g. send STOP auto-reply) without a
follow-up secret push. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected into Edge Functions; we don't set them.

## Verification (3 tests against the live URL)

| Test | curl | Expected | Actual |
|---|---|---|---|
| No signature headers | POST without headers | `401` + `missing_headers` | ✅ |
| Forged signature | POST with random base64 sig | `401` + `bad_signature` | ✅ |
| Stale timestamp | POST with `telnyx-timestamp: 1234567890` | `401` + `stale_timestamp` | ✅ |

Each test also generated a `webhook_events` row with `signature_ok = false`
and the rejection reason in `process_error` — audit trail confirmed.

## Implementation notes / decisions

- **Body-first read.** `await req.text()` before any JSON parsing.
  Signature is over the raw byte sequence; re-stringifying produces
  different whitespace and breaks verification.
- **Audit before reject.** The `INSERT` into `webhook_events` runs even
  for forged signatures so we have a forensic trail. Only after the
  audit row is committed do we return `401`.
- **5-minute replay window** matches Telnyx's documented anti-replay
  guarantee. Wider windows let attackers replay yesterday's events;
  narrower trip on legitimate clock skew.
- **`crypto.subtle` for Ed25519.** Deno's Web Crypto API supports
  Ed25519 directly — no third-party crypto dep needed.
- **Audit insert failure → 500.** If we can't even log, return 500 so
  Telnyx retries. Better double-process (idempotency catches it later)
  than silently lose an event.
- **Unhandled event types** still 200 (Telnyx shouldn't retry them) but
  the audit row is annotated with `process_error = 'unhandled_event_type'`
  so we can spot drift between Telnyx's catalog and our dispatcher.

## What's intentionally NOT here

- **No `call_logs` / `sms_logs` writes** — Stage 2 does call lifecycle,
  Stage 3 does SMS. Idempotency (`provider_event_id` UNIQUE) is enforced
  inside those handlers, not in this dispatcher.
- **No tenant routing yet.** Stage 1.5's `tenantFromTo(to)` lookup is a
  per-handler concern. This skeleton just buckets everything into the
  audit table.
- **No Vault read for the public key.** The stage-1 doc plans a
  `vault.decrypted_secrets` lookup; we use Edge Function secrets for
  now (functionally equivalent for reading; Vault adds rotation/audit
  story).
- **`TELNYX_PUBLIC_KEY` is platform-wide.** Per-tenant signing keys
  aren't a Telnyx feature and aren't needed.

## Forensics — querying audit

```sql
-- All recent events
SELECT id, event_type, signature_ok, process_error, received_at
  FROM webhook_events
 WHERE provider = 'telnyx'
 ORDER BY received_at DESC
 LIMIT 50;

-- Any forged-signature attempts in the last hour
SELECT count(*), array_agg(distinct event_type)
  FROM webhook_events
 WHERE provider = 'telnyx'
   AND signature_ok = false
   AND received_at > now() - interval '1 hour';

-- Replay a specific event into a future handler
SELECT payload FROM webhook_events WHERE id = '<uuid>';
```

## Next step

**Step 3 — `apps/web/lib/telnyx/client.ts`.** Server-only wrapper for
the Telnyx REST API: `searchAvailableNumbers`, `purchaseNumber`,
`releaseNumber`, plus `sendSms` / `initiateCall` primitives that
Stages 2/3 will call. Unit-testable with mocked `fetch`. Per
[number-provisioning-implementation.md §4](number-provisioning-implementation.md).

## References

- [stage-1-comms-foundation.md §3](stage-1-comms-foundation.md) — webhook skeleton spec
- [number-provisioning-implementation.md](number-provisioning-implementation.md) — overall flow
- Telnyx webhook signing docs: <https://developers.telnyx.com/docs/api/v2/overview#webhook-signing>
