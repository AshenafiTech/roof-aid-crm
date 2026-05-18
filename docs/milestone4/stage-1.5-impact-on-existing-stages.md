# Stage 1.5 — Impact on existing M4 stages

> Companion to `stage-1.5-tenant-phone-numbers.md`. This document
> captures **how stage 1.5 changes assumptions baked into the
> previously-written M4 stages**, and lists the targeted edits each
> impacted doc / code path will need before it can ship.
>
> Written 2026-04-29 after the product owner clarified: each tenant
> owns their own dedicated phone number(s), tenants must see what's
> theirs, and homeowners must be able to call back.

---

## 1. Where stage 1.5 aligns with the existing M4 plan

No conflict here — stage 1.5 sits inside the same architectural envelope:

- **Single `telnyx-webhook` Edge Function**, signature verification, Vault
  for secrets, `webhook_events` audit table, idempotency via
  `provider_event_id` / `provider_message_id` UNIQUE columns (all from
  stage 1).
- **Same RLS philosophy** — tenant-scoped reads, owner/admin-gated writes.
- **Reuses `users.telnyx_extension`** (added in migration `010`) for
  inbound *agent* routing. Extensions and DIDs serve different
  purposes and coexist:
  - DID = the tenant's phone number a homeowner sees / dials
  - Extension = the SIP credential a rep's browser uses to log in to WebRTC
- **Outbound paths still go through `can_call()` / `can_message()`** —
  number selection happens *after* the RPC says "ok".

---

## 2. Gaps in the existing M4 plan that stage 1.5 explicitly fills

These are spots where the original docs already noted "TBD" or
deferred a decision. Stage 1.5 makes the call.

| Existing doc | Quote | How stage 1.5 resolves it |
|---|---|---|
| `stage-2-web-softphone.md` line 173 | *"Identify tenant from `event.payload.to`… needs a `tenant_phone_numbers` table or a `tenants.telnyx_number TEXT UNIQUE` column"* | Picks the table option. Webhook calls `tenantFromTo(to)` helper that selects from `tenant_phone_numbers` keyed on `e164`. |
| `stage-3-web-sms.md` line 264 | *"v1: one tenant = one Telnyx number. M7 adds per-agent numbers."* | Generalizes to 1→many from day one. Per-rep numbers stay M7; per-tenant-multi-number is now stage 1.5. |
| Blueprint M7-1 | "Assign Telnyx extensions" mentioned in user management; never specifies how a tenant *acquires* a number in the first place. | Stage 1.5 onboarding wizard step 2 + `/admin/settings/phone-numbers` page own number lifecycle. |

---

## 3. Direct conflicts with the existing M4 plan

These are the spots where stage 1.5 **contradicts** something already
written. Each row points to the existing doc/file and the targeted edit
that needs to land before that stage ships.

### 3.1 Outbound SMS `from` is hardcoded to a platform number

| Where | What it says | What it needs to say |
|---|---|---|
| `stage-3-web-sms.md` §4 (worker), line 125 | `from: process.env.TELNYX_DEFAULT_NUMBER` | Read the `from` E.164 off the `sms_logs` row that the request already wrote. The request handler picks the number — the worker doesn't second-guess it. |

**Required code-path change in stage 3:**

```ts
// before (stage 3 as written)
body: JSON.stringify({
  from: process.env.TELNYX_DEFAULT_NUMBER,
  to:   sms.to_number,
  text: sms.body,
}),

// after (stage 1.5 conformant)
body: JSON.stringify({
  from: sms.from_number,   // was set by the request handler from tenant's primary or "Send from" pick
  to:   sms.to_number,
  text: sms.body,
}),
```

The request handler (the server action invoked when a rep clicks Send)
becomes responsible for picking `from_number`:

```ts
const fromE164 = await pickOutboundNumber({
  tenantId,
  preferredNumberId,           // from the "Send from" dropdown if present
});
await admin.from('sms_logs').insert({
  ...,
  from_number: fromE164,
  tenant_phone_number_id: pickedRow.id,
});
```

### 3.2 Inbound call routing is "any online agent"

| Where | What it says | What it needs to say |
|---|---|---|
| `stage-2-web-softphone.md` §4 line 174 | *"Find the agent currently online… for v1, route to *any* online agent; M7 adds round-robin"* | Read `tenant_phone_numbers.routing_rule` for the dialed number. Dispatch per `kind` (`ring_all` / `assigned_rep_first_then_all` / `voicemail_only`). Round-robin can still wait for M7. |

**Required handler change in stage 2:**

```ts
async function handleInbound(event) {
  const to = event.payload.to;
  const tpn = await tenantPhoneNumberFromE164(to);
  if (!tpn) return ack();             // unknown number, log + 200

  // NEW — pull routing rule from the dialed number
  const rule = tpn.routing_rule ?? { kind: 'ring_all' };

  switch (rule.kind) {
    case 'voicemail_only':
      return sendToVoicemail(event, tpn);
    case 'assigned_rep_first_then_all':
      return ringAssignedThenFallback(event, tpn, rule);
    case 'ring_all':
    default:
      return ringAllOnline(event, tpn, rule);
  }
}
```

### 3.3 Pre-req list expects one platform-wide phone number

| Where | What it says | What it needs to say |
|---|---|---|
| `README.md §4` (Pre-requisites) | *"Telnyx account provisioned with: One phone number per environment (dev/staging/prod)"* | Numbers are acquired per-tenant via the onboarding wizard. Optional dev-only fallback number for system-test traffic that isn't bound to a tenant yet. |
| `README.md §4` env list | `TELNYX_DEFAULT_NUMBER=` | Demote to dev-only; remove from prod env. New required var: `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_VOICE_APP_ID` (so purchased numbers can be auto-attached). |

### 3.4 Caller-ID terminology is misleading in the blueprint

| Where | What it says | What it needs to say |
|---|---|---|
| Blueprint M4-2 | *"Outbound Caller ID = agent's Telnyx extension"* | "Outbound Caller ID = the tenant phone number selected for the call (defaults to the tenant's primary number; rep can override via 'Send from' dropdown when tenant has >1 number)." |

Extensions aren't dialable from the PSTN. The original wording probably
meant "the number associated with the agent" — but stage 1.5 makes the
binding tenant-level, not agent-level (per-rep numbers stay M7).

### 3.5 Single source of truth for the tenant's primary number changed

| Where | What it says | What it needs to say |
|---|---|---|
| `tenants.telnyx_main_number TEXT` (migration `002_core_tables.sql`) | The tenant's main phone number lives in this column. | Soft-deprecated. Source of truth becomes `SELECT e164 FROM tenant_phone_numbers WHERE tenant_id = $1 AND is_primary = true AND status = 'active'`. Drop the column in M5 once all readers are off it. |

Any code that currently reads `tenants.telnyx_main_number` (none yet —
M4 hasn't started — but the seed scripts and any provisioning Edge
Function would) needs to switch to the new lookup.

---

## 4. New surfaces stage 1.5 introduces (not in any other M4 doc)

These don't conflict with anything because they didn't exist before.
Listed here for completeness so reviewers know the full delta:

- **`tenant_phone_numbers` table** (migration `013`) with a unique-primary
  partial index and active-only e164 index.
- **`tenant_phone_number_id` FK** on `call_logs` and `sms_logs` for
  per-number attribution and marketing tracking.
- **`apps/web/lib/telnyx/client.ts`** — reusable typed wrapper for
  search / purchase / release / sendSms / initiateCall (currently each
  existing stage rolls its own ad-hoc `fetch`).
- **`/onboarding` 3-step wizard** — Business profile → Pick number →
  Calling preferences.
- **`/admin/settings/phone-numbers`** — list, label, set primary,
  set routing rule, "+ Add another number" modal, soft-release.
- **"Send from" dropdown** on Call/SMS dialogs when the tenant has >1
  number; choice persists per-rep in `localStorage`.
- **Missing-number amber banner** rendered in the dashboard layout when
  a tenant has zero active numbers.
- **Per-number `routing_rule` JSON shape** as part of the schema
  (`ring_all` / `assigned_rep_first_then_all` / `voicemail_only`).

---

## 5. What stage 1.5 keeps deferred (matches original M4 scope)

So nobody mistakes "stage 1.5 doesn't mention X" for "stage 1.5 removes X":

- WebRTC credential generation → still stage 2.
- Recording capture + disposition modal → still stage 2.
- SMS thread UI, STOP keyword auto-DNC, templates, segment counter →
  still stage 3.
- Email entirely → stage 4.
- DNC enforcement at every dial site → stage 5.
- Notification bell → stage 6.
- Mobile SMS reply → stage 7.
- Per-rep dedicated numbers → still M7.
- 10DLC actual brand submission → post-launch (info collected at onboarding).
- Stripe billing for telecom usage → post-launch (per product-owner direction).

---

## 6. Required edits to other M4 docs once stage 1.5 lands

Concrete checklist a reviewer / future contributor can work through:

- [x] **`README.md §4`** — pre-req replaced with per-tenant-via-onboarding wording.
- [x] **`README.md §4` env block** — `TELNYX_DEFAULT_NUMBER` demoted to dev-only; `TELNYX_MESSAGING_PROFILE_ID` and `TELNYX_VOICE_APP_ID` added as required.
- [x] **`README.md §2` table row M4-2** — caller-ID wording fixed.
- [x] **`stage-2-web-softphone.md` §4 (`handleInbound`)** — "any online agent" replaced with `routing_rule` dispatch; references stage 1.5 for `tenantFromTo()`. `persistCallLog` now stamps `tenant_phone_number_id`.
- [x] **`stage-3-web-sms.md` §3 + §4** — added §3.1 with `pickOutboundNumber()` helper; worker reads `sms.from_number` (set by request handler) instead of `process.env.TELNYX_DEFAULT_NUMBER`. RPC writes `from_number` and `tenant_phone_number_id` on the row. Inbound handler resolves via `tenantFromTo()` and stamps `tenant_phone_number_id`. Migration index reserved (1.5 owns `013`; SMS-column adds become `014`).
- [x] **`stage-3-web-sms.md` §10 notes** — "v1: one tenant = one Telnyx number" caveat replaced with multi-number reply-consistency rule (default Send-from to the inbound thread's `to_number`).
- [x] **Blueprint M4-2 line** — caller-ID wording fixed and links to stage 1.5.
- [x] **Migration `010` extension** — kept `users.telnyx_extension` unchanged; no schema change required here.

All edits applied 2026-04-29 alongside this doc. PR for the actual code
(stage 1.5 PR 1) still moves the docs and the implementation together
when it lands.

---

## 7. Net effect summary

Stage 1.5 is **additive plumbing that retroactively fixes ambiguities**
in stages 2 and 3 plus the M4 README. It doesn't break any other stage
doc. The required follow-ups (§6) are small, all of them inside docs
that haven't been implemented yet, so the cost of absorbing the change
is low — but it has to happen *before* stages 2 and 3 ship, otherwise
outbound SMS will go from a single platform number and inbound calls
won't honor per-number routing.

The PR sequence in `stage-1.5-tenant-phone-numbers.md §10` is unchanged:

1. **PR 1** — migration `013` + Telnyx client wrapper + webhook
   tenant-resolution helper. Doesn't touch any UI; doesn't change any
   existing stage's behavior.
2. **PR 2** — onboarding wizard + settings page.
3. **PR 3** — "Send from" picker + log stamping + missing-number banner.

PRs 4+ (stages 2, 3 etc. from the original plan) absorb the
follow-ups in §6 as part of their own work.
