# Telnyx Credentials Setup

Walkthrough for populating the Telnyx-related env vars in `.env.local` for Milestone 4 (comms foundation).

## Purpose

Milestone 4 introduces voice + SMS via Telnyx. Before any code in Stage 1 (M4-5 webhook) or Stage 2 (web softphone) can run, the developer needs valid Telnyx credentials in their environment. This document is the field guide.

## Env vars covered

```
TELNYX_API_KEY                 # V2 API key
TELNYX_PUBLIC_KEY              # Webhook signature verification, Ed25519 base64
TELNYX_MESSAGING_PROFILE_ID    # Messaging → Profiles → "Roof-Aid"
TELNYX_VOICE_APP_ID            # Voice → Call Control Apps → "Roof-Aid"
TELNYX_APP_ID                  # Legacy alias for TELNYX_VOICE_APP_ID
TELNYX_CONNECTION_ID           # SIP/WebRTC connection (Stage 2 only)
TELNYX_DEFAULT_NUMBER          # E.164, dev-only fallback
```

## Prerequisites

1. Account at [portal.telnyx.com](https://portal.telnyx.com) with billing configured.
2. At least one phone number purchased (Numbers → Buy Numbers). Most fields below need a number to bind to.

## Steps

### 1. `TELNYX_API_KEY`
- Account → API Keys → **Create API Key**
- Name: `roof-aid-server`
- Copy once (Telnyx won't show it again). Starts with `KEY...`.
- Confirm it's a V2 key.

### 2. `TELNYX_PUBLIC_KEY`
- Account → Public Key
- Copy the base64-encoded Ed25519 public key (single line).
- Account-wide; used by the `telnyx-webhook` Edge Function to verify the
  `telnyx-signature-ed25519-signature` header on every incoming webhook.

### 3. `TELNYX_MESSAGING_PROFILE_ID`
- Messaging → Messaging Profiles → **Add new profile**
- Name: `Roof-Aid`
- Inbound Webhook URL:
  `https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook`
- Webhook API version: `2`
- Save → click into profile → copy the **ID** (UUID).
- Numbers → My Numbers → assign each number's Messaging Profile to `Roof-Aid`.

### 4. `TELNYX_VOICE_APP_ID` (and `TELNYX_APP_ID`)
- Voice → Call Control Applications → **Create application**
- Name: `Roof-Aid`
- Webhook URL: same as above —
  `https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook`
  (single Edge Function switches on `event_type` for both messaging + voice).
- Webhook API version: `2`
- Save → copy the Application ID (UUID).
- Set `TELNYX_APP_ID` to the **same value**; it's a legacy alias the codebase still reads.
- Numbers → My Numbers → assign each number's Connection / App to this Call Control app.

### 5. `TELNYX_CONNECTION_ID` *(Stage 2 only — skip until softphone work)*
- Voice → SIP Connections (or WebRTC → Credentials for browser dialer)
- Create a connection: `roof-aid-webrtc`
- Copy the numeric Connection ID.

### 6. `TELNYX_DEFAULT_NUMBER`
- Numbers → My Numbers → copy any number in E.164 format (e.g. `+14795550123`).
- Used as the dev-only fallback when no per-tenant number is configured
  (per Stage 1.5 — `tenant_phone_numbers` table owns this in production).

## Webhook URL summary

| Telnyx config | Value |
|---|---|
| Messaging Profile inbound webhook | `https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook` |
| Voice Call Control app webhook | `https://ivmfmpscdimyepbvrbee.supabase.co/functions/v1/telnyx-webhook` |
| Webhook API version (both) | `2` |

The `telnyx-webhook` Edge Function is the **single endpoint** for all
Telnyx events (call.* and message.*). It does not exist yet — it's planned
for Stage 1 (M4-5). Telnyx will accept and store the URL fine; deliveries
will 404 until the function is deployed.

## Verification

```bash
curl -H "Authorization: Bearer $TELNYX_API_KEY" \
  https://api.telnyx.com/v2/phone_numbers
```
Should return JSON listing the numbers on the account.

## Important notes

- **Signing secrets belong in Supabase Vault**, not env vars, per
  [milestone4/README.md](milestone4/README.md). `.env.local` is fine for the
  Next.js side during dev, but the Edge Function reads `TELNYX_PUBLIC_KEY`
  from Vault.
- **One Messaging Profile + one Call Control App for the whole account.**
  Per-tenant numbers all attach to these same two — all events flow through
  the single webhook. See Stage 1.5 for the `tenant_phone_numbers` design.
- **Local dev:** for testing webhooks against your laptop, either run
  `supabase functions serve telnyx-webhook` + `ngrok http 54321` and
  temporarily swap the portal URL, or maintain a separate "dev" Messaging
  Profile + Call Control App pointed at the ngrok URL while the production
  ones stay pointed at Supabase. The latter is safer.

## Setup decisions captured during initial provisioning (2026-04-29)

These decisions are not derivable from the schema or code — they're operational
choices made while filling out the Telnyx portal for the first time:

- **Two dev numbers purchased** (`+1-512-980-6131` tagged `tenant-dev-1`,
  `+1-512-566-1478` tagged `tenant-dev-2`) to simulate the Stage 1.5
  per-tenant routing. Real tenant numbers will be bought programmatically
  during onboarding.
- **Existing 479 numbers left untouched** — they belong to a separate Vapi /
  CRM0 setup. Roof-Aid only owns the two 512 numbers.
- **One Outbound Voice Profile (`Roof-Aid Outbound`)** with:
  - Channel limit: 10
  - Max destination rate: $1/min (auto-blocks premium-rate fraud)
  - Daily spend limit: $10 (dev) — bump to $50–100 for prod
  - Recording: **Do Not Record** until TCPA two-party consent UX is in
    Stage 2 softphone
- **One Voice API Application (`Roof-Aid CRM`)** — both 512 numbers attached.
- **One Messaging Profile (`Roof-Aid`)** — both 512 numbers attached, US-only
  destinations, Smart Encoding ON, no STOP/HELP keyword auto-replies (the
  webhook handles STOP atomically per [milestone4/README.md:143](milestone4/README.md#L143)).
- **Allowed destinations**: North America only (US + Canada). Other regions
  not enabled — fraud-cost containment.
- **10DLC registration**: pending. Yellow ⚠️ on numbers will remain until the
  Brand + Campaign are registered via The Campaign Registry. Doesn't block
  dev; will affect deliverability in production.

## Related

- [milestone4/README.md](milestone4/README.md)
- [milestone4/stage-1-comms-foundation.md](milestone4/stage-1-comms-foundation.md)
- [milestone4/stage-1.5-tenant-phone-numbers.md](milestone4/stage-1.5-tenant-phone-numbers.md)
