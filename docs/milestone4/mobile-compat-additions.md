# M4 mobile-compat additions on `feat/milestone-4-next`

**Author:** Robel (mobile track) merging on top of friend's web track.

## Why

The mobile branch (`feat/m4-mobile-sms`) was built against three contracts that were **drift-installed** on the dev DB but missing from this branch's formal migration history:

1. `sms_logs.read_at` column (referenced by index in [017](../../supabase/migrations/017_sms_logs_status_reconcile.sql) but never added)
2. `mark_sms_read(uuid)` RPC (mobile fires it fire-and-forget on tab open)
3. `send_sms(uuid, text)` RPC — 2-arg signature for mobile (the web stage 3 plan used a different 5-arg signature; both can coexist as overloaded functions)

Without these in formal migrations, a fresh DB (CI / staging / new dev clone) would break the mobile flow even after the friend's stage 1+3 migrations applied cleanly.

## What was added

### 1. New migration — [`022_mobile_sms_compat.sql`](../../supabase/migrations/022_mobile_sms_compat.sql)

Strictly additive. Does not alter or replace anything from migrations 001–021.

- `ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS read_at timestamptz` — idempotent; works even if drift-installed already
- `mark_sms_read(uuid)` RPC — `SECURITY INVOKER`, tenant-scoped via `public.get_tenant_id()`
- `send_sms(uuid, text)` RPC — `SECURITY DEFINER`. Resolves the from-number from `tenant_phone_numbers` (primary first, then any active SMS-capable). Fires the Telnyx call via `pg_net` (fire-and-forget). Returns the new `sms_logs.id`.

### 2. Edit — [`supabase/functions/_shared/sms-handlers.ts`](../../supabase/functions/_shared/sms-handlers.ts)

Added a **Phase B fallback** to `handleOutboundSmsStatus`. Previous behavior (Phase A — match by `provider_message_id`) is unchanged and remains the common path for the web `/actions` flow. Phase B only fires when Phase A finds no row.

**Why Phase B is needed:** mobile's `send_sms` RPC uses `pg_net` (async), so the row gets inserted with `provider_message_id IS NULL`. When the first `message.sent` / `message.finalized` webhook arrives, Phase A finds nothing. Phase B then matches the most recent queued outbound to the same `to_number` with no message id stamped, and writes both the status and the `provider_message_id` together.

**Idempotency preserved:** subsequent webhooks for the same message hit Phase A (row now has a `provider_message_id`) and apply only the status delta.

## ⚠️ DNC policy alignment

The friend's `can_message` (migrations [011](../../supabase/migrations/011_can_call_rpc.sql) + [019](../../supabase/migrations/019_can_call_rich_verdict.sql)) **returns `allowed:false, reason:'dnc'` for DNC-flagged prospects.** That contradicts the client policy ("DNC is informational, not a block — agent takes responsibility").

The new `send_sms` RPC handles this at the policy boundary:

```sql
IF NOT (v_verdict->>'allowed')::boolean AND v_reason IS DISTINCT FROM 'dnc' THEN
  RAISE EXCEPTION 'sms_not_allowed: %', v_reason;
END IF;
```

DNC is the only `allowed:false` reason that doesn't block. All others (`no_phone`, `cross_tenant`, `tenant_has_no_sms_number`, `not_found`) still hard-block.

The mobile UI already handles this consistently — `CanMessageVerdict.blocksUi` returns `!allowed && reason != 'dnc'`, so the composer stays open for DNC-flagged prospects and the page-level `DncBanner` provides the warning.

This is a **policy-boundary disagreement** between the web verdicts (block) and mobile send (allow). Worth a short conversation with the friend to align on a single source of truth — currently:

- Web `can_message` says DNC is blocking.
- Web `/actions/send-sms` will (presumably) raise on `allowed:false`, blocking DNC sends from web.
- Mobile send (via `send_sms` RPC) tolerates DNC and proceeds.

Resolution options when the friend is back:

1. **Align with mobile policy:** modify `can_message` (and `can_call`) to NOT return `allowed:false` for DNC. Surface as `do_not_call_warning: true` field. Web `/actions` updates to render the warning instead of blocking. (My preference — matches the M3-6 client-confirmed deviation.)
2. **Align with web policy:** revert mobile to block on DNC. Requires mobile UI changes to add an override-confirm dialog.
3. **Status quo (current):** mobile sends ignore DNC, web sends block. Inconsistent UX between surfaces.

## Pre-requisites for the test-roofing tenant to actually work

- `tenant_phone_numbers` row with `tenant_id = 7ab88bbb-cf23-4b80-bfdd-5368869e1e0d`, `status = 'active'`, `'sms' = ANY(capabilities)`. Ideally `is_primary = true`.
- `vault.decrypted_secrets` named `TELNYX_API_KEY` with a valid Telnyx key.
- Telnyx messaging profile attached to the chosen number (else Telnyx returns the 10004 error).
- 10DLC registration for the number (else carrier returns the 40010 error and message lands as `failed`).

## Migration order safety

Verified: 022 runs cleanly on top of 001–021 because:

- The `read_at` column add is `IF NOT EXISTS` — idempotent against the drift install.
- The two new RPCs are net-new function names (no overload collision with the friend's planned 5-arg `send_sms`; if/when that lands as `send_sms(uuid,text,text,uuid,uuid)`, both versions coexist).
- `pg_net` extension is `IF NOT EXISTS`.
- No existing tables/columns/policies are altered.
