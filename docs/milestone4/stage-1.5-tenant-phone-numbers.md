# Stage 1.5 — Per-tenant phone numbers (multi-DID)

> **Addendum to `stage-1-comms-foundation.md`.** Lands between stage 1
> (foundation) and stage 2 (softphone) so every later stage can assume
> "tenant has 1 or more numbers" rather than the original spec's
> "tenant has one main number".

**Goal:** Each roofing-company tenant owns one or more dedicated Telnyx
phone numbers (DIDs). Numbers are reserved per tenant, surfaced in
Roof-Aid's UI so the tenant always knows what's theirs, and route both
outbound (caller ID) and inbound (homeowner callbacks/replies) through
the right tenant context.

**Outcome of this stage:**
- A tenant owner walks through `/onboarding`, picks at least one number
  by area code, and lands on the dashboard with a working business line.
- Settings page lets them add more numbers, label them, set a routing
  rule per number, and set the primary.
- Outbound calls/SMS from any rep use the tenant's number as caller ID.
  When a tenant has >1 number, the rep picks one ("Send from" dropdown).
- Inbound calls/SMS to any of the tenant's numbers land in that
  tenant's data — webhook resolves `tenant_id` from the dialed `to`.

**Estimated time:** 1.5 days for foundation (PR 1) + 1 day for UI (PR 2)
+ 0.5 day for outbound/inbound wiring (PR 3) = **3 days**.

---

## 1. Why this delta exists

The blueprint and stage-1 doc assume a single number per tenant
(`tenants.telnyx_main_number TEXT`). Product owner clarified the
requirement on 2026-04-29: every roofing company gets dedicated
phone number(s), they must see what they're using, and homeowners
must be able to call back. Multiple numbers per tenant is wanted from
day one — driven by:

- Multi-office tenants wanting a local-area-code line per office
  (materially higher pickup rates with a local caller ID).
- Marketing attribution (different numbers on yard signs, ads, etc.).
- Per-rep numbers as a future paid upgrade for larger teams.

Single-number-per-tenant is a strict subset of many-numbers-per-tenant,
so the model below collapses to the original spec for tenants that
only want one.

---

## 2. Schema delta

### `013_tenant_phone_numbers.sql`

```sql
CREATE TABLE tenant_phone_numbers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Telnyx side
  telnyx_number_id    text NOT NULL UNIQUE,           -- Telnyx DID id (uuid string)
  e164                text NOT NULL UNIQUE,           -- e.g. +15551234567
  capabilities        text[] NOT NULL DEFAULT '{}',   -- subset of {voice, sms, mms}
  messaging_profile_id text,                          -- Telnyx Messaging Profile attached
  voice_app_id        text,                           -- Telnyx Call Control App attached

  -- Roof-Aid side
  label               text NOT NULL DEFAULT 'Main',   -- free-text, tenant-visible
  is_primary          boolean NOT NULL DEFAULT false, -- one per tenant; outbound default
  routing_rule        jsonb NOT NULL DEFAULT '{
    "kind": "ring_all",
    "voicemail_after_seconds": 25
  }'::jsonb,

  -- Lifecycle
  status              text NOT NULL DEFAULT 'active'  -- active | suspended | released
                      CHECK (status IN ('active','suspended','released')),
  released_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL
);

-- One primary per tenant
CREATE UNIQUE INDEX tenant_phone_numbers_one_primary
  ON tenant_phone_numbers (tenant_id)
  WHERE is_primary = true AND status = 'active';

-- Inbound routing lookup: webhook resolves tenant by dialed `to`
CREATE INDEX tenant_phone_numbers_e164_active
  ON tenant_phone_numbers (e164)
  WHERE status = 'active';

CREATE INDEX tenant_phone_numbers_tenant
  ON tenant_phone_numbers (tenant_id, status);

-- RLS — tenant scoped, only owners/admins can write
ALTER TABLE tenant_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpn_select ON tenant_phone_numbers FOR SELECT TO authenticated
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY tpn_insert ON tenant_phone_numbers FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) IN ('owner','admin')
);

CREATE POLICY tpn_update ON tenant_phone_numbers FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) IN ('owner','admin')
);

-- DELETE forbidden — tenants release numbers via soft status='released'
-- so we keep the audit trail. Hard delete only by service role.
```

### Soft-deprecate `tenants.telnyx_main_number`

We keep the column for backward compat through M4, but it is no longer
the source of truth. Reads should go through:

```sql
SELECT e164 FROM tenant_phone_numbers
 WHERE tenant_id = $1 AND is_primary = true AND status = 'active';
```

A follow-up migration in M5 drops the column once all callers are off it.

### Stamp tenant numbers on log rows

`call_logs`, `sms_logs` already have `tenant_id`. Add a nullable FK so
we know *which* of the tenant's numbers handled the call/message — this
is what powers per-number usage rollups and marketing attribution:

```sql
ALTER TABLE call_logs ADD COLUMN tenant_phone_number_id uuid
  REFERENCES tenant_phone_numbers(id) ON DELETE SET NULL;
ALTER TABLE sms_logs  ADD COLUMN tenant_phone_number_id uuid
  REFERENCES tenant_phone_numbers(id) ON DELETE SET NULL;

CREATE INDEX call_logs_per_number ON call_logs (tenant_phone_number_id, started_at DESC);
CREATE INDEX sms_logs_per_number  ON sms_logs  (tenant_phone_number_id, sent_at DESC);
```

---

## 3. Telnyx client wrapper

`apps/web/lib/telnyx/client.ts` — a thin server-only module. Reads
secrets from Supabase Vault via `lib/supabase/admin.ts`, never the
client bundle. Placeholders use `${TELNYX_API_KEY}`, `${TELNYX_PUBLIC_KEY}`,
etc. — wire to real values later.

API surface (TypeScript signatures):

```ts
export type AvailableNumber = {
  e164: string;
  city: string | null;
  region: string;          // e.g. "AR"
  monthly_cost_usd: number;
  capabilities: ("voice" | "sms" | "mms")[];
};

// Search Telnyx inventory by area code (NPA, e.g. "479" for Bentonville).
// Returns up to 20. Used by the onboarding picker.
export function searchAvailableNumbers(opts: {
  areaCode: string;
  features?: ("voice" | "sms" | "mms")[];   // default ["voice","sms"]
  limit?: number;                            // default 20
}): Promise<AvailableNumber[]>;

// Purchase a specific number, attach it to our Messaging Profile +
// Call Control App, and return the Telnyx number id.
export function purchaseNumber(opts: {
  e164: string;
}): Promise<{
  telnyx_number_id: string;
  capabilities: ("voice" | "sms" | "mms")[];
  messaging_profile_id: string;
  voice_app_id: string;
}>;

// Release a number back to Telnyx (only if status='released' in our DB).
export function releaseNumber(telnyxNumberId: string): Promise<void>;

// Outbound primitives
export function sendSms(opts: {
  from: string;            // e164 of one of the tenant's numbers
  to: string;              // homeowner e164
  text: string;
}): Promise<{ messageId: string }>;

export function initiateCall(opts: {
  from: string;            // e164 of one of the tenant's numbers
  to: string;
  agentExtension: string;  // SIP extension to bridge into
}): Promise<{ callControlId: string }>;
```

All Telnyx HTTP calls go through one `fetch` helper that:
- adds `Authorization: Bearer <TELNYX_API_KEY>`,
- stamps `Idempotency-Key: <uuid>` on POSTs that mutate,
- retries on 429 / 5xx with exponential backoff (max 3 tries),
- throws a typed `TelnyxError` with code + Telnyx error id for our logs.

---

## 4. Webhook updates

`supabase/functions/telnyx-webhook/index.ts` (defined in stage 1)
gets one new responsibility: **resolve `tenant_id` from the dialed
`to` number** before any handler runs.

```ts
async function tenantFromTo(to: string): Promise<{
  tenant_id: string;
  tenant_phone_number_id: string;
} | null> {
  const { data } = await admin
    .from("tenant_phone_numbers")
    .select("id, tenant_id")
    .eq("e164", to)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  return { tenant_id: data.tenant_id, tenant_phone_number_id: data.id };
}
```

If `tenantFromTo()` returns `null` for an inbound event, log to
`webhook_events.process_error = 'unknown_to_number'` and 200 anyway
(don't make Telnyx retry). This catches pre-purchase inventory probes
and stale numbers.

The handler then sets the tenant context on every downstream insert
(via `set_config('app.tenant_id', ...)` so RLS applies).

---

## 5. Onboarding flow (UI)

### `/onboarding` becomes a 3-step wizard

| Step | Screen | Required to advance? |
|------|--------|-----------------------|
| 1 | **Business profile** — legal name, address, EIN (optional in dev), contact name + email + phone, timezone (defaults from browser) | Yes |
| 2 | **Pick your business line** — area code search → list of available numbers → confirm & purchase | Yes (must own ≥1) |
| 3 | **Calling preferences** — default calling hours (08:00–20:00 mon-sat by default), recording disclosure (use Telnyx default audio for now) | No, has defaults |

The wizard writes into `tenants` (steps 1, 3) and `tenant_phone_numbers`
(step 2). Step 2 calls a server action `purchaseAndAttachNumber()` that:

1. Calls `telnyx.purchaseNumber({ e164 })`.
2. Inserts `tenant_phone_numbers` row with `is_primary = true`,
   `status = 'active'`, `label = 'Main'`.
3. Returns to the wizard.

### Step 2 UI sketch

```
┌─ Pick your business line ────────────────────────────────┐
│ Roof-Aid will get you a dedicated phone number that      │
│ homeowners can call and text. You can add more numbers   │
│ later.                                                    │
│                                                           │
│  Area code:  [ 479 ]   [ Search ]                         │
│                                                           │
│  ○ +1 (479) 555-0188   Bentonville, AR  $1.00/mo         │
│  ● +1 (479) 555-0192   Bentonville, AR  $1.00/mo         │
│  ○ +1 (479) 555-0214   Fayetteville, AR $1.00/mo         │
│  ○ +1 (479) 555-0301   Bentonville, AR  $1.00/mo         │
│                                          [ Show 16 more ] │
│                                                           │
│  Label this number:  [ Main                            ]  │
│                                                           │
│                            [ Skip → ]  [ Buy & continue ] │
└───────────────────────────────────────────────────────────┘
```

(Skip is hidden in production but visible in dev so QA tenants can be
created without consuming Telnyx inventory — they just won't be able
to call/text until they add a number from settings.)

### Banner for tenants without a number

`apps/web/app/(dashboard)/layout.tsx` renders a sticky amber banner
on every dashboard page when the tenant has zero `active`
`tenant_phone_numbers`:

> ⚠️ Your business line isn't set up yet. **[Set it up →](/admin/settings/phone-numbers)**

Banner dismisses itself once they have ≥1 active number.

---

## 6. Phone numbers settings page

`/admin/settings/phone-numbers` — owner + admin only. Lists every active
number with:

- E.164 (formatted as `+1 (555) 123-4567`)
- Editable label
- Primary radio (one)
- Routing rule dropdown:
  - **Ring all reps** (default)
  - **Ring assigned rep, then ring all** (fallback)
  - **Send to voicemail** (after-hours / unstaffed)
- Capabilities badge (Voice / SMS / MMS)
- "This month" usage stub: `12 calls · 47 SMS` (real numbers wired
  in stage 5 dashboard; stub for now)
- Actions: ⋯ menu → "Release number"

A single button **"+ Add another number"** opens the same picker UI
from onboarding step 2 in a modal.

Releasing a number flips `status = 'released'` and `released_at = now()`
in our DB, then calls `telnyx.releaseNumber(telnyx_number_id)`. We do
not delete the row — log entries that reference it stay valid.

---

## 7. Outbound — "Send from" picker

When a rep clicks Call or SMS on a prospect:

1. Server action loads `tenant_phone_numbers WHERE tenant_id = ? AND status='active'`.
2. If only 1 number: use it silently.
3. If >1: render a small dropdown at the top of the call/SMS dialog:
   ```
   Send from: [ ▼ Main · +1 (479) 555-0192       ]
              [   Bentonville Office · +1 (479)…  ]
              [   Fayetteville Office · +1 (479)… ]
   ```
   Default = primary. Selection persists in `localStorage` per rep so
   they don't have to choose every time.
4. Both `call_logs.tenant_phone_number_id` and
   `sms_logs.tenant_phone_number_id` are stamped with the selected row's id.

---

## 8. Inbound — per-number routing

Each `tenant_phone_numbers.routing_rule` is a small JSON shape:

```json
{ "kind": "ring_all", "voicemail_after_seconds": 25 }
{ "kind": "assigned_rep_first_then_all", "voicemail_after_seconds": 25 }
{ "kind": "voicemail_only" }
```

The webhook's call-event handler (lands in stage 2 with the softphone)
reads this rule when an inbound call event arrives and dispatches
accordingly. Stage 1.5 only ships the schema + UI — the actual call
fan-out is stage 2's job, but the contract is fixed here so stage 2
doesn't have to invent it.

Inbound SMS is simpler: it always lands in the prospect thread for the
matched `from` number, regardless of routing rule. (Routing rule is a
voice concept.)

---

## 9. Environment variables (placeholders)

Add to `apps/web/.env.example`:

```
# Telnyx — values pasted from Telnyx portal. In Supabase Vault for prod.
TELNYX_API_KEY=__placeholder_v2_api_key__
TELNYX_PUBLIC_KEY=__placeholder_ed25519_public_key__
TELNYX_MESSAGING_PROFILE_ID=__placeholder_messaging_profile_id__
TELNYX_VOICE_APP_ID=__placeholder_call_control_app_id__
TELNYX_CONNECTION_ID=__placeholder_webrtc_connection_id__   # only needed in stage 2

# Webhook URL (set in Telnyx portal after deploy):
# https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook
```

In Supabase Vault (run via SQL editor, replace placeholders):

```sql
SELECT vault.create_secret('TELNYX_API_KEY',                '__placeholder__');
SELECT vault.create_secret('TELNYX_PUBLIC_KEY',             '__placeholder__');
SELECT vault.create_secret('TELNYX_MESSAGING_PROFILE_ID',   '__placeholder__');
SELECT vault.create_secret('TELNYX_VOICE_APP_ID',           '__placeholder__');
```

Code reads via the existing `lib/supabase/admin.ts` pattern.

---

## 10. PR breakdown

| PR | Scope | Depends on |
|----|-------|-----------|
| PR 1 | Migration `013` + Telnyx client wrapper + webhook tenant-resolution helper. No UI yet. | Stage 1 webhook skeleton |
| PR 2 | Onboarding wizard (steps 1–3) + `/admin/settings/phone-numbers` page + "+ Add number" modal | PR 1 |
| PR 3 | "Send from" picker on Call/SMS dialogs + `tenant_phone_number_id` stamping on log rows + missing-number banner in dashboard layout | PR 1, PR 2 |

Stages 2 (softphone) and 3 (web SMS) from the original M4 plan can
start as soon as PR 1 ships — they just need a valid
`tenant_phone_numbers` row to test against.

---

## 11. Definition of done

### Foundation (PR 1)
- [ ] Migration `013` runs cleanly on dev DB; `\d tenant_phone_numbers` shows columns + indexes + RLS policies.
- [ ] `telnyx.searchAvailableNumbers({ areaCode: "479" })` returns ≥1 number from a Node REPL.
- [ ] Forging the dialed `to` to an unknown number on the webhook returns 200 and inserts `webhook_events.process_error = 'unknown_to_number'`.

### Onboarding (PR 2)
- [ ] New tenant log-in lands at `/onboarding` step 1; can complete all 3 steps; ends at dashboard with a working primary number visible in settings.
- [ ] `/admin/settings/phone-numbers` lists the number, allows label edit, allows adding a second number, allows releasing a non-primary number.
- [ ] Tenant with zero active numbers sees the amber banner on every dashboard page.

### Outbound + Inbound (PR 3)
- [ ] Call/SMS dialog shows the "Send from" dropdown when tenant has >1 number.
- [ ] Selected number is stamped on the resulting `call_logs` / `sms_logs` row.
- [ ] Inbound webhook routes events to the correct tenant based on the `to` number.

### Cross-cutting
- [ ] No Telnyx secret appears in the client bundle (`grep -r TELNYX_ apps/web/.next/static` returns nothing).
- [ ] All API calls to Telnyx are server-side (server actions / Edge Functions); no `process.env.TELNYX_*` in any `"use client"` file.
- [ ] RLS test: a user from tenant A cannot SELECT, UPDATE, or DELETE any `tenant_phone_numbers` row belonging to tenant B.

---

## 12. Out of scope for this stage (deferred)

- Plan tiers / number caps — open ended in dev.
- Stripe billing for telecom — usage is logged but not invoiced yet.
- 10DLC brand registration submission — info collected, submission deferred until production launch.
- Per-rep dedicated numbers — one tenant-shared number is sufficient; per-rep numbers come back as a configurable mode in M7.
- Number porting (bring-your-own-number) — purchase-only at launch.
- Verified caller-ID / branded calling display — Telnyx supports it; revisit post-launch.
