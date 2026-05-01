# Step 6 — Stage 3 SMS backend

**Date:** 2026-04-30
**Stage:** M4 Stage 3 — Web SMS (backend half)
**Files added/modified:**
- `supabase/migrations/014_sms_logs_extensions.sql` — sms_logs columns + Realtime
- `supabase/functions/_shared/tenant-from-to.ts` — webhook tenant resolver
- `supabase/functions/_shared/sms-handlers.ts` — inbound + outbound status handlers
- `supabase/functions/telnyx-webhook/index.ts` — dispatcher wired for `message.*`
- `apps/web/lib/telnyx/pick-outbound-number.ts` — outbound `from` picker
- `apps/web/lib/sms/actions.ts` — `sendSms` server action
- `apps/web/lib/supabase/database.types.ts` — regenerated

## Purpose

Make the SMS data path real, end-to-end:

- Outbound: server action → Telnyx → DB row → Realtime → UI (UI lands in Step 7)
- Inbound: Telnyx → webhook → tenant resolution → DB row → notifications
- STOP keyword: webhook detects → flips DNC + sends TCPA-required acknowledgement
- Compliance gate: DNC is a confirmation prompt, not a hard block — per
  [memory note](../../../../.claude/projects/-home-ashe-Documents-work-roof-aid-crm/memory/feedback_dnc_warning_only.md)

## Migration 014 — `sms_logs` extensions

| Change | Why |
|---|---|
| Extend `status` CHECK to include `queued` and `received` | New states for the inserted-then-sent flow + inbound rows |
| `segments` INT DEFAULT 1 | Persisted segment count for cost reporting |
| `acknowledged_warnings` TEXT[] DEFAULT `{}` | Audit trail when a caller overrides a DNC warning. `SELECT * FROM sms_logs WHERE 'dnc' = ANY(acknowledged_warnings)` answers "show me every send that overrode DNC" — defends a future complaint |
| `error_code` TEXT | Provider error code on `failed` rows |
| Index `sms_logs_prospect_thread` (prospect_id, created_at DESC) | Powers the per-prospect thread query |
| Index `sms_logs_from_inbound` | Powers inbound STOP/triage lookups |
| `ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs` | Enables UI Realtime subscription |

## Webhook handlers

`telnyx-webhook` now routes:

| Event type | Handler | Effect |
|---|---|---|
| `message.received` | `handleInboundSms` | Resolve tenant via `tenantFromTo(to)` → upsert inbound row → STOP-keyword detection → notify assigned rep |
| `message.sent` | `handleOutboundSmsStatus(payload, 'sent')` | Update sms_logs row keyed on `provider_message_id` |
| `message.finalized` | inspects `payload.to[].status` → `handleOutboundSmsStatus(..., 'delivered'\|'failed')` | Terminal status |
| `call.*` | logged with `process_error: 'pending_stage_2_call_handler'` | Stage 2 territory |
| anything else | logged with `process_error: 'unhandled_event_type'` | drift detection |

Each handler is wrapped in try/catch; failures annotate the audit row's
`process_error` instead of crashing the dispatcher (Telnyx wouldn't retry a 200,
and we already have the raw payload for replay).

### Inbound flow detail

`handleInboundSms` runs in this order — order matters:
1. Look up tenant via the dialed `to` number
2. **Upsert** the inbound `sms_logs` row first (idempotent on `provider_message_id`).
   This lands the message in the conversation thread even if subsequent steps fail.
3. STOP-keyword regex match → set `prospect.do_not_call = true` with reason `'sms_stop_keyword'` and `do_not_call_at = now()`
4. STOP detected → send the auto-reply *"You've been unsubscribed. Reply START to opt back in."* via Telnyx and log the outbound row alongside
5. If the message wasn't STOP, insert a `notifications` row for the prospect's assigned rep (or creator)

### `tenantFromTo` resolver

Looks up `tenant_phone_numbers.e164` where `status='active'` and returns
`{ tenant_id, tenant_phone_number_id }`. Unknown numbers return `null` —
the webhook 200s and audits with no further action.

## Outbound number picker — `pickOutboundNumber`

Server-only helper that picks the right `from` number for a given prospect + capability. Precedence:

1. **Explicit pick** — rep used a "Send from" dropdown
2. **Conversation continuity** — match the `tenant_phone_number_id` of the most recent inbound SMS for this prospect (avoids the "why is this reply coming from a different number?" confusion)
3. **Tenant primary** with the requested capability
4. **Any active** with the capability (last resort)
5. Throws `NoOutboundNumberError` if the tenant has none

`TELNYX_DEFAULT_NUMBER` is **not** consulted — that's dev-only fallback.

## `sendSms` server action

Public surface used by the upcoming UI (Step 7) and any future caller (mobile, AI, etc.):

```ts
sendSms({
  prospectId: string,
  body: string,
  preferredNumberId?: string,
  acknowledgedWarnings?: ('dnc' | 'outside_calling_hours')[],
}): Promise<SendSmsResult>
```

Flow:
1. Auth check via `createClient()` (cookie session)
2. `supabase.rpc('can_message', { p_prospect_id })` returns the verdict
3. **Compliance gate**:
   - `not_found` / `cross_tenant` / `no_phone` → hard block, return `{ ok: false, error: ... }`
   - `dnc` → if `'dnc'` not in `acknowledgedWarnings`, return `{ ok: false, requiresAcknowledgement: ['dnc'] }`. Otherwise fall through.
   - `ok` → fall through
4. Pick the outbound number (`pickOutboundNumber`)
5. Validate prospect's first phone exists
6. Insert `sms_logs` row with `status='queued'`, `acknowledged_warnings=[...]`, computed `segments`
7. Call Telnyx `/v2/messages` via the existing `telnyxSendSms` wrapper (auth, idempotency-key, retries — all from Step 3)
8. Update the row to `status='sent'` with `provider_message_id`
9. On Telnyx failure: update row to `status='failed'` with `error_code`
10. Return the row id; UI's Realtime subscription propagates the row to the thread

Result type is a discriminated union — the UI uses `result.requiresAcknowledgement` to decide whether to open the DNC confirmation modal.

## Verified

- **TypeScript**: `tsc --noEmit` passes after regenerating database.types.ts
- **Migration applied**: `supabase migration list --linked` shows 014 in both Local and Remote
- **Webhook deployment**: function redeployed via Management API (Cloudflare CDN, no IPv6 issue)
- **Signature verification still works**: forged signatures and missing headers return 401 with the expected reasons; the audit row is still written before the reject

## Manual end-to-end test plan (live, with real Telnyx traffic)

The full path can't be tested without sending real SMS. To do that:

1. From a real US phone, text any tenant number (e.g. `+1-512-980-6131`)
2. Watch Supabase logs for the webhook hit (Edge Functions tab)
3. Verify a row appeared in `sms_logs` with `direction='inbound'`, the right `tenant_phone_number_id`, and (if the phone matches a seeded prospect) `prospect_id` populated
4. Verify a row appeared in `notifications` for the assigned rep
5. Text the same number with body `STOP` — verify:
   - Inbound row inserted
   - Outbound `"You've been unsubscribed..."` row inserted
   - The prospect's `do_not_call` flag is now `true` with reason `'sms_stop_keyword'`
   - Real phone receives the auto-reply

For outbound, Step 7's UI is the way to drive `sendSms`. Direct test:
- From the dashboard, navigate to a prospect with `phones[0]` set
- Step 7 will add a "Send SMS" button — click → see the row appear as `queued` then flip to `sent` then `delivered`

## What's intentionally NOT here

- **`tasks` table + cron worker** — the original Stage 3 spec proposes
  async send via a `tasks` queue. We send synchronously since Telnyx
  typically responds in 200–500ms and the UI gets a row immediately
  via the `queued` insert. If we ever measure user-visible latency
  pain, we can move the Telnyx call into a task.
- **`apply_sms_stop` RPC** — STOP handling lives in the Edge Function
  helpers instead. Same atomicity (single function call), simpler
  observability (one place to read logs).
- **`dnc_records` table writes** — the original spec inserts a row
  here too, but the table doesn't exist yet (it's a Stage 5 concern).
  We set `prospect.do_not_call_reason = 'sms_stop_keyword'` instead
  so Stage 5 can backfill or extend the audit.
- **Templates loading** — `tenants.sms_templates` exists from migration
  010 but the loader/dropdown is UI work for Step 7.
- **Calling-hours check for SMS** — `can_message()` doesn't include the
  hours check (TCPA SMS quiet-hours rules differ from voice). Adding
  that is a separate compliance decision; the action is structured to
  accept `'outside_calling_hours'` in `acknowledgedWarnings` if we
  later want to gate it.

## Next: Step 7 — SMS UI

- `<SmsThread>` component with Realtime subscription on `sms_logs` filtered by prospect
- `<SmsComposer>` with character/segment counter, templates dropdown
- Integration into prospect detail page (sheet/side-panel or new tab)
- DNC confirmation modal that calls `sendSms` with `acknowledgedWarnings: ['dnc']` after user confirms

## References

- [stage-3-web-sms.md](stage-3-web-sms.md) — full spec
- [step-2-telnyx-webhook-skeleton.md](step-2-telnyx-webhook-skeleton.md) — base webhook
- [step-3-telnyx-client-wrapper.md](step-3-telnyx-client-wrapper.md) — Telnyx wrapper
- [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md) — multi-number routing
- DNC-as-warning policy: `~/.claude/projects/.../memory/feedback_dnc_warning_only.md`
