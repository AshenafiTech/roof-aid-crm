# Automated Tenant Number Provisioning — Implementation Reference

> Companion to [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md).
> That doc covers the **schema + UI design**. This doc captures the
> **provisioning automation** — what infrastructure exists in Telnyx
> today, what env vars are wired, and exactly what the code does when a
> tenant clicks "Buy & continue" in onboarding.

## Goal

When a roofing-company tenant subscribes to Roof-Aid, they pick an area
code, click a number, and **a real US phone number is provisioned and
wired to our webhook in ~10 seconds, with zero manual intervention.**

---

## 1. Pre-provisioned Telnyx infrastructure (one-time, platform-level)

These resources are configured once for the whole Roof-Aid platform.
Every tenant number gets attached to the same set:

| Resource | Name | ID |
|---|---|---|
| Messaging Profile | `Roof-Aid` | `40019dd8-725c-49fa-8237-ff3e34ef6b48` |
| Voice Call Control Application | `Roof-Aid CRM` | `2948749871345043410` |
| Outbound Voice Profile | `Roof-Aid Outbound` | (referenced via the app) |
| Webhook URL (single endpoint, voice + SMS) | `https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook` | — |

### Outbound Voice Profile settings (fraud safety)

| Setting | Value |
|---|---|
| Allowed destinations | North America (US + Canada) |
| Channel limit | 10 concurrent calls |
| Max destination rate | $1.00/min (auto-blocks premium-rate numbers) |
| Daily spend limit | $10 (dev) — bump to $50–100 in prod |
| Recording | Off (enable per-call after TCPA consent UX is built in Stage 2) |

### Dev test numbers (already purchased)

| Number | Tag | Purpose |
|---|---|---|
| `+1-512-980-6131` | `tenant-dev-1` | Simulates first dev tenant |
| `+1-512-566-1478` | `tenant-dev-2` | Simulates second dev tenant |

Both are attached to the messaging profile **and** the voice connection,
so end-to-end SMS + voice flows can be tested locally.

---

## 2. Environment variables (already filled in `apps/web/.env.local`)

| Var | Used for |
|---|---|
| `TELNYX_API_KEY` | Auth header on every Telnyx HTTP call |
| `TELNYX_PUBLIC_KEY` | Verifying signatures on inbound webhook events |
| `TELNYX_MESSAGING_PROFILE_ID` | Attached to every purchased number → SMS routes to our webhook |
| `TELNYX_VOICE_APP_ID` | Used as `connection_id` in purchase orders → calls route to our webhook |
| `TELNYX_APP_ID` | Legacy alias = same value as `TELNYX_VOICE_APP_ID` |
| `TELNYX_DEFAULT_NUMBER` | Dev-only fallback when no tenant context exists |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Inserting `tenant_phone_numbers` rows from server actions |

`TELNYX_CONNECTION_ID` is intentionally empty — that's a Stage 2 (WebRTC
softphone) value, not used for number provisioning.

---

## 3. Provisioning flow (end-to-end)

### What the tenant sees

```
/onboarding → Step 2: Pick your business line

  Area code:  [ 479 ]   [ Search ]

  ● +1 (479) 555-0188   Bentonville, AR  $1/mo
  ○ +1 (479) 555-0192   Bentonville, AR  $1/mo
  ○ +1 (479) 555-0214   Fayetteville, AR $1/mo

  Label: [ Main ]
                                    [ Buy & continue ]
```

### What happens when they click "Search"

```
[client]  POST /api/onboarding/numbers/search { area_code: "479" }
          ↓
[server]  searchAvailableNumbers({ areaCode: "479" })
          ↓
          GET https://api.telnyx.com/v2/available_phone_numbers
              ?filter[national_destination_code]=479
              &filter[features]=sms,voice,mms
              &filter[limit]=20
              Authorization: Bearer $TELNYX_API_KEY
          ↓
[telnyx]  200 OK { data: [...20 numbers] }
          ↓
[server]  shape into AvailableNumber[] → return to client
          ↓
[client]  render the list
```

### What happens when they click "Buy & continue"

```
[client]  POST /api/onboarding/numbers/purchase
            { e164: "+14795550188", label: "Main" }
          ↓
[server-action]  purchaseAndAttachNumber()
          ↓
          ┌─ telnyx.purchaseNumber({ e164 }) ─────────────────┐
          │ POST https://api.telnyx.com/v2/number_orders      │
          │   Authorization: Bearer $TELNYX_API_KEY           │
          │   Idempotency-Key: <uuid>                         │
          │   {                                               │
          │     phone_numbers: [{ phone_number: "+1479..." }],│
          │     messaging_profile_id: $TELNYX_MESSAGING_...,  │
          │     connection_id: $TELNYX_VOICE_APP_ID           │
          │   }                                               │
          │                                                   │
          │ 201 Created → { id, phone_numbers: [...] }        │
          └───────────────────────────────────────────────────┘
          ↓
          INSERT INTO tenant_phone_numbers (
            tenant_id, telnyx_number_id, e164, capabilities,
            messaging_profile_id, voice_app_id,
            label, is_primary, status
          ) VALUES (
            <current_tenant>, <telnyx id>, '+14795550188',
            ARRAY['voice','sms','mms'],
            $TELNYX_MESSAGING_PROFILE_ID,
            $TELNYX_VOICE_APP_ID,
            'Main', true, 'active'
          );
          ↓
[client]  redirect → /onboarding/step-3 (calling preferences)
```

Total wall-clock time: typically 3–8 seconds.

---

## 4. Code modules to build

### `apps/web/lib/telnyx/client.ts`

Server-only, ~150 lines. Three exports plus a private `fetch` helper:

```ts
// Public API
export function searchAvailableNumbers(opts: {
  areaCode: string;
  features?: ("voice" | "sms" | "mms")[];
  limit?: number;
}): Promise<AvailableNumber[]>;

export function purchaseNumber(opts: { e164: string }): Promise<{
  telnyx_number_id: string;
  capabilities: ("voice" | "sms" | "mms")[];
  messaging_profile_id: string;
  voice_app_id: string;
}>;

export function releaseNumber(telnyxNumberId: string): Promise<void>;

// Plus shared SMS / Call primitives used by Stages 2-3
export function sendSms(opts: { from: string; to: string; text: string }): Promise<{ messageId: string }>;
export function initiateCall(opts: { from: string; to: string; agentExtension: string }): Promise<{ callControlId: string }>;
```

The `fetch` helper:
- Adds `Authorization: Bearer $TELNYX_API_KEY`
- Stamps `Idempotency-Key: <uuid>` on every POST
- Retries on `429` and `5xx` with exponential backoff (max 3 tries)
- Throws a typed `TelnyxError` carrying Telnyx's error code + reference id

### `apps/web/app/api/onboarding/numbers/search/route.ts`

Thin route handler that calls `searchAvailableNumbers` and shapes the
response for the picker UI. Tenant context required (otherwise 401).

### `apps/web/app/api/onboarding/numbers/purchase/route.ts` (or server action)

The `purchaseAndAttachNumber` server action. Steps:

1. Validate caller is the tenant owner (RLS + role check)
2. Reject if tenant already has `is_primary=true` active number
3. Call `telnyx.purchaseNumber({ e164 })`
4. `INSERT` into `tenant_phone_numbers`
5. On any failure between step 3 and 4, **schedule a release**:
   - Insert a row in `pending_number_releases` with `telnyx_number_id`
   - A small cron Edge Function picks it up and calls `releaseNumber` to avoid leaking paid-for numbers we never recorded

### `supabase/migrations/013_tenant_phone_numbers.sql`

Per [stage-1.5 §2](stage-1.5-tenant-phone-numbers.md#2-schema-delta).

### `supabase/functions/telnyx-webhook/index.ts`

The single Edge Function handling all Telnyx events. The provisioning
flow doesn't strictly *create* anything in the webhook — but newly
purchased numbers will start receiving inbound events immediately, so
the webhook must already be deployed before tenants onboard. Built in
Stage 1 (M4-5) before this provisioning feature lands.

---

## 5. Failure modes and handling

| Failure | Detection | Recovery |
|---|---|---|
| Telnyx number unavailable (someone else bought it between search and purchase) | `400` from `POST /v2/number_orders` | Surface "Number no longer available, please pick another" → re-render search |
| Telnyx API timeout / 5xx | `fetch` retry exhausts | Surface generic "Try again" — purchase is idempotent (we set `Idempotency-Key`) |
| Insert into `tenant_phone_numbers` fails after Telnyx purchase succeeded | DB error caught after API success | Insert into `pending_number_releases` for cleanup; show user a soft error and a support contact |
| Telnyx account out of balance | `402` Payment Required | Page Roof-Aid ops; tenant sees "We're processing your number, hang tight" — this is on us, not them |
| Tenant abandons mid-flow (closes tab after purchase) | Number is bought but no DB row | The retry-on-resume of the wizard re-uses the `Idempotency-Key`, so reload completes the insert |

**Mitigation: enable Telnyx auto-recharge.** Set in Telnyx portal →
Account → Billing → Auto-recharge. Without it, an after-hours onboarding
can fail because the account hit $0.

---

## 6. What is *not* automated (and why)

### 10DLC Brand + Campaign registration — one-time, platform-level

US carriers (AT&T, T-Mobile, Verizon) require Application-to-Person SMS
to be registered through The Campaign Registry (TCR), or messages get
heavily filtered. This registration is for **Roof-Aid the platform**,
not per-tenant — every number we provision inherits it.

- Done **once** by Roof-Aid ops via Telnyx portal → Messaging → 10DLC
- ~$4 one-time Brand fee, ~$10/mo Campaign fee
- Review takes 1–3 business days
- Tenants don't see this — they just get good deliverability post-registration

Without 10DLC: provisioning still works, but production SMS will be
filtered. Defer until ready to onboard real tenants.

### Stripe billing — separate concern

Telnyx charges **our Telnyx account** when `POST /v2/number_orders`
returns 200. That happens regardless of whether the tenant has paid us
yet. Recouping that cost from the tenant is a Stripe flow that runs
independently:

- Dev / MVP: skip Stripe, eat the ~$1/mo per number
- Production: wire Stripe before opening signups, or bundle the number
  into a SaaS subscription so they're already paying

Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) are scaffolded in `.env.example`
but not part of M4 scope.

### Number porting (tenant brings their existing business line)

Out of scope for M4. Manual ticket-based process via Telnyx support if
a tenant requests it — not common in our target market.

---

## 7. Testing strategy

### Local dev

- Use the two pre-purchased dev numbers (`+1-512-980-6131`,
  `+1-512-566-1478`) as if they were freshly provisioned. Insert
  matching `tenant_phone_numbers` rows manually for two seed tenants.
- Mock `searchAvailableNumbers` to return a fixed list (don't hit the
  Telnyx API on every test run).
- Don't actually call `purchaseNumber` in tests — it costs real money.
  Mock at the `fetch` boundary.

### Staging

- Provision **one** real number per CI run, then immediately call
  `releaseNumber` in cleanup. Cost per run: a few cents.
- Verify `tenant_phone_numbers.messaging_profile_id` and `voice_app_id`
  match the env vars after purchase.

### Production smoke test

- After deploying, provision a single number for a "Roof-Aid Internal"
  tenant. Send a test SMS to it from a real phone. Verify the webhook
  fires and `tenantFromTo()` resolves correctly.

---

## 8. Cost model (Telnyx-side, per tenant)

| Item | Cost |
|---|---|
| Number monthly fee (US local) | ~$1.00 |
| Inbound SMS | ~$0.0040 each |
| Outbound SMS | ~$0.0075 each |
| Inbound voice | ~$0.0035/min |
| Outbound voice (US) | ~$0.0070/min |
| 10DLC Campaign (platform-wide, not per-tenant) | ~$10.00/mo |

Roof-Aid's Stripe pricing should bake in a healthy multiplier on top of
these so per-tenant gross margin stays positive even for chatty users.

---

## 9. Implementation order

1. **Stage 1 / M4-5** — `telnyx-webhook` Edge Function deployed first.
   Without it, newly provisioned numbers receive events into a black hole.
2. **Migration `013`** — `tenant_phone_numbers` table + indexes + RLS.
3. **`lib/telnyx/client.ts`** — wrapper functions; unit-tested with a
   mocked `fetch`.
4. **Onboarding wizard step 2** — picker UI + server action.
5. **Settings page** (`/admin/settings/phone-numbers`) — add / remove /
   re-label / re-route / set primary.
6. **"Send from" dropdown** in Call/SMS dialogs (Stage 2 + 3 work).

Steps 1–2 unblock everything else. Step 3 lands as a single PR with
unit tests. Steps 4–5 are pure UI work on top of the wrapper.

---

## 10. References

- [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md) — schema, UI flows, RLS
- [stage-1.5-impact-on-existing-stages.md](stage-1.5-impact-on-existing-stages.md) — how this changes Stages 2-3
- [stage-1-comms-foundation.md](stage-1-comms-foundation.md) — webhook function spec
- [../telnyx-credentials-setup.md](../telnyx-credentials-setup.md) — how the Telnyx portal was configured (the manual one-time setup)
- Telnyx API docs: <https://developers.telnyx.com/api/numbers/list-available-phone-numbers>
- Telnyx API docs: <https://developers.telnyx.com/api/numbers/create-number-order>
