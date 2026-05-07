# Step 3 — `lib/telnyx/client.ts` (Telnyx REST wrapper)

**Date:** 2026-04-30
**Stage:** M4 Stage 1.5 — supports number provisioning
**Files added:**
- `apps/web/lib/telnyx/types.ts` — shared types
- `apps/web/lib/telnyx/errors.ts` — typed `TelnyxError` class
- `apps/web/lib/telnyx/fetch.ts` — internal fetch helper (auth, retries, idempotency)
- `apps/web/lib/telnyx/client.ts` — public API surface

## Purpose

Server-only wrapper around the Telnyx V2 REST API. The onboarding
wizard, settings page, softphone (Stage 2), and SMS module (Stage 3)
all call into this module — they never hit `api.telnyx.com` directly.

Centralizing here means:
- Auth, retries, idempotency, and error mapping live in one place
- Tests mock at one boundary (the `fetch` inside `fetch.ts`)
- Future Telnyx SDK changes are absorbed in one file

## Public API

```ts
// Number provisioning (Stage 1.5)
searchAvailableNumbers({ areaCode, features?, limit? }): AvailableNumber[]
purchaseNumber({ e164 }): PurchasedNumber
releaseNumber(telnyxNumberId): void

// Comms primitives (Stages 2-3)
sendSms({ from, to, text }): { messageId }
initiateCall({ from, to, agentExtension }): { callControlId }
```

All five functions are typed end-to-end, throw `TelnyxError` on
non-2xx, and read config from server-side env vars.

## Internals

### `fetch.ts` — the helper that does the work

| Concern | How it's handled |
|---|---|
| **Auth** | `Authorization: Bearer ${TELNYX_API_KEY}` injected on every request. Throws if env var is missing. |
| **Idempotency** | `Idempotency-Key: <uuid>` stamped on every POST by default. Prevents double-charging on retry of `POST /number_orders`, `POST /messages`, `POST /calls`. Override with `idempotent: false` for endpoints that don't need it. |
| **Retries** | 3 attempts max, exponential backoff (500ms / 1s / 2s), only on `429 / 500 / 502 / 503 / 504`. Network errors (transport-level) also retry. |
| **Errors** | Non-2xx after retries → `TelnyxError` carrying status, code, detail, and raw response body. Callers can `switch (err.code)`. |
| **`server-only`** | Marker import — Next.js refuses to bundle this into a client component. Belt and suspenders against accidental key leaks. |

### `errors.ts` — typed Telnyx error

Telnyx returns:
```json
{ "errors": [{ "code": "10009", "title": "...", "detail": "..." }] }
```

`fromTelnyxResponse()` shapes this into a `TelnyxError` with `.code`,
`.detail`, `.status`, and `.raw` so callers don't re-parse JSON.

### `client.ts` — the public exports

#### `searchAvailableNumbers`
- Maps to `GET /v2/available_phone_numbers`
- Filters: country `US`, area code, features (default `["voice","sms"]`), limit (default 20, max 100)
- Returns shaped `AvailableNumber[]` with city, state, monthly cost, capabilities

#### `purchaseNumber`
- Maps to `POST /v2/number_orders`
- Auto-attaches the platform's `TELNYX_MESSAGING_PROFILE_ID` and
  `TELNYX_VOICE_APP_ID` (used as `connection_id`). The number is wired
  to our webhook the instant the order returns 200.
- Follows up with `GET /v2/phone_numbers/{id}` to get the canonical
  feature list (the order response sometimes omits it)

#### `releaseNumber`
- Maps to `DELETE /v2/phone_numbers/{id}`
- Stops monthly billing
- Caller is responsible for soft-deleting the `tenant_phone_numbers`
  row first (`status='released'`) so log entries that reference it
  stay valid

#### `sendSms` / `initiateCall`
- Stage 3 / Stage 2 primitives. Implemented now so handlers in those
  stages don't need to add fetch plumbing later. Not exercised by
  Stage 1.5.

## Smoke test against live Telnyx API

We validated the exact query format used by `searchAvailableNumbers`:

```bash
curl -H "Authorization: Bearer $TELNYX_API_KEY" \
  "https://api.telnyx.com/v2/available_phone_numbers\
?filter[national_destination_code]=479\
&filter[features]=sms&filter[features]=voice\
&filter[country_code]=US\
&filter[limit]=3"
```

→ returned 3 real Arkansas (479) numbers with `voice + sms + mms`
features and `monthly_cost: "1.00000"`. Confirmed the parser reads:
- `features[].name` for capabilities
- `region_information[]` with `region_type === "state"` for region
- `region_information[]` with `region_type === "rate_center"` or
  `"location"` for city (Telnyx uses `"location"`, not `"locality"`)
- `cost_information.monthly_cost` (a STRING — wrapper does `Number(...)`)

## TypeScript compile

`npx tsc --noEmit` against the whole web app — passes clean. No new
errors introduced.

## What's intentionally not here

- **Vault-based secret read.** `TELNYX_API_KEY` reads from
  `process.env`. Migrating to Supabase Vault is a Stage 1 follow-up
  per [stage-1-comms-foundation.md §2](stage-1-comms-foundation.md);
  this wrapper takes whatever env source you point it at.
- **Per-request rate-limit budget.** Telnyx rate-limits are generous
  enough at our volume that a per-request budget would be premature
  optimization. The 429-retry path covers spikes.
- **Mock factory for tests.** Tests should mock at the `fetch` global
  via vitest's `vi.spyOn(globalThis, 'fetch')`. Not adding a DI shim
  for a 5-function module.
- **Webhook signature helpers.** Lives in
  `supabase/functions/_shared/telnyx-signature.ts` (Step 2) — that's
  Edge-Function-side, not Next.js-side.

## Next step

**Step 4 — Onboarding wizard step 2 (number picker + purchase flow).**
Wires this client into the UI:

1. `app/api/onboarding/numbers/search/route.ts` — POST handler that
   calls `searchAvailableNumbers` and returns the list to the client
2. Server action `purchaseAndAttachNumber()` that:
   - Validates caller is the tenant owner
   - Calls `purchaseNumber({ e164 })`
   - Inserts `tenant_phone_numbers` row with `is_primary=true`
   - On any insert failure after a successful purchase, schedules a
     release via `pending_number_releases` (Step 5 covers this safety net)
3. Onboarding step 2 React component (area-code search → list → confirm)

## References

- [number-provisioning-implementation.md](number-provisioning-implementation.md) §4
- [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md) §3
- Telnyx API: <https://developers.telnyx.com/api/numbers>
