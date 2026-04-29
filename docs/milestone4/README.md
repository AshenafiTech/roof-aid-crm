# Milestone 4 — Communication: Phone, SMS, Email

**Duration:** Week 5
**Goal:** Light up the three communication channels Telefonistas use all day — phone (Telnyx WebRTC softphone), SMS (Telnyx messaging), and email (SendGrid) — with full TCPA-grade DNC enforcement, real-time inbound delivery, and a notification system that ties everything together. Surface SMS conversations on mobile so Ruferos can reply from the field.

---

## 1. Why this milestone matters

After M3 the platform looks like a CRM. After **M4 it actually generates revenue**. Every dollar a roofing company makes starts with someone picking up the phone — and the difference between "another spreadsheet" and "a real CRM" is whether that phone call:

1. Dials in one click from a prospect card
2. Shows the agent's caller ID, not a random toll-free
3. Gets recorded and tied to the prospect's record automatically
4. Logs a disposition so the next agent knows what happened
5. Refuses to dial a DNC-flagged number after 8pm in the homeowner's timezone

M4 makes all of that real. It's also the first milestone where **outside services own data we depend on** — Telnyx call/SMS state, SendGrid delivery status — so the webhook + idempotency story has to be airtight from day one.

After M4, the demo flips from "look at this dashboard" to "watch me close a deal in 90 seconds." That's the moment Roof-Aid stops being a project and becomes a product.

---

## 2. Scope summary (from blueprint M4)

| # | Task | Surface |
|---|------|---------|
| M4-1 | WebRTC softphone component (Telnyx) — mic/level/CALL/MUTE/HOLD/TRANSFER/HANGUP, incoming-call banner, status indicator | Web |
| M4-2 | Click-to-call from any Call button → softphone dials. Caller ID = the tenant's selected phone number from `tenant_phone_numbers` (defaults to the tenant's primary; rep can override via "Send from" dropdown when the tenant has >1 number). See `stage-1.5-tenant-phone-numbers.md`. | Web |
| M4-3 | Call disposition modal after hangup → record into `call_logs` + activity | Web |
| M4-4 | Call recording → Supabase Storage `call-recordings/{tenant_id}/{call_id}.mp3` + tenant-configurable disclosure prompt | Web + Storage |
| M4-5 | Telnyx webhook Edge Function — inbound call routing, inbound SMS, call-event lifecycle, idempotency, signature verification | Edge Function |
| M4-6 | SMS module — threaded conversation per prospect, templates, segment counter, delivery status, STOP-keyword auto-DNC | Web + DB |
| M4-7 | Email module — compose/send via SendGrid, templates, all logged to `email_logs` | Web |
| M4-8 | SendGrid webhook — inbound email parsing, bounce + spam handling, status updates | Edge Function |
| M4-9 | DNC compliance enforcement — calling-hours by tenant timezone, DNC disables Call+SMS, auto-DNC on SMS STOP | DB + Web + Mobile |
| M4-10 | Notification bell — real-time unread count, dropdown feed, mark-as-read, click-through | Web |
| M4-11 | Mobile SMS reply — threaded conversation per assigned prospect, reply composer, unread badges | Mobile |

---

## 3. Execution plan — 7 stages

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Telnyx + SendGrid foundation: accounts, numbers, env vars, schema additions, `can_call()` RPC, webhook scaffolding | [stage-1-comms-foundation.md](stage-1-comms-foundation.md) |
| 2 | Web WebRTC softphone — Telnyx WebRTC SDK integration, click-to-call, disposition modal, recording | [stage-2-web-softphone.md](stage-2-web-softphone.md) |
| 3 | Web SMS module — threaded view, send/receive, templates, STOP keyword | [stage-3-web-sms.md](stage-3-web-sms.md) |
| 4 | Web Email module — SendGrid send, templates, `email_logs`, bounce/spam handling | [stage-4-web-email.md](stage-4-web-email.md) |
| 5 | DNC + calling-hours enforcement — single source of truth (`can_call()` + `can_message()`), wired into every send/dial site | [stage-5-dnc-enforcement.md](stage-5-dnc-enforcement.md) |
| 6 | Notification bell — Realtime feed in nav bar, click-through, mark-as-read | [stage-6-notification-bell.md](stage-6-notification-bell.md) |
| 7 | Mobile SMS reply — Flutter thread view + composer, unread badges | [stage-7-mobile-sms.md](stage-7-mobile-sms.md) |

Stages 2–4 are mostly independent (different surfaces) and can parallelize once Stage 1 is shipped. Stage 5 lands last so it can wire into all the call/send sites that already exist. Stage 7 (mobile) can start after Stage 3 ships the SMS RPC contract.

---

## 4. Pre-requisites (must be done before starting M4)

- [ ] **M3 Definition of Done signed off** — mainly: prospect detail tabs render, DNC flag UI exists (informational; M4 turns it from advisory into hard enforcement)
- [ ] **Telnyx account provisioned** with:
  - **One Messaging Profile** named "Roof-Aid" (`TELNYX_MESSAGING_PROFILE_ID`). Numbers purchased per-tenant via onboarding are auto-attached to this profile so all events flow to our webhook.
  - **One Voice / Call Control Application** named "Roof-Aid" (`TELNYX_VOICE_APP_ID`). Same — every tenant's purchased number is auto-attached.
  - **Per-tenant phone numbers** — acquired by tenant owners via the `/onboarding` wizard (see `stage-1.5-tenant-phone-numbers.md`). No platform-wide DID is required in prod.
  - **Optional dev-only fallback number** (`TELNYX_DEFAULT_NUMBER`) for system-test traffic that isn't bound to a tenant yet. Not used in prod.
  - WebRTC credentials issued per-rep at runtime against `TELNYX_CONNECTION_ID`.
  - Webhook URL configured: `https://<project>.supabase.co/functions/v1/telnyx-webhook`
- [ ] **SendGrid account provisioned** with:
  - Verified sender domain (DKIM + SPF DNS records added)
  - One subuser per tenant (created lazily via API in M4 — but the parent account must support subusers, i.e. Pro plan minimum)
  - Inbound Parse webhook configured: `https://<project>.supabase.co/functions/v1/sendgrid-webhook`
  - Event webhook configured (delivery / bounce / spam) on the same endpoint
- [ ] **Telnyx + SendGrid signing secrets stored** in Supabase Vault (NOT env vars) — both providers HMAC-sign webhooks, must verify
- [ ] **Storage bucket `call-recordings`** created, private, RLS-locked to `{tenant_id}/...` paths (mirror existing `inspection-photos` policy)
- [ ] **Tables verified present from M1 schema:** `call_logs`, `sms_logs`, `email_logs`, `notifications`, `dnc_records`. Schema additions land as migrations during Stage 1
- [ ] **Tenant timezone field** — every tenant must have `timezone` (e.g. `America/Chicago`) populated. Required for calling-hours enforcement
- [ ] **Telnyx extension assignment field on `users`** — `telnyx_extension TEXT` column added if missing. Used to route inbound calls to the right agent's WebRTC session
- [ ] **Environment variables added** to `.env.example`:
  ```
  TELNYX_API_KEY=                       # required — V2 API key
  TELNYX_PUBLIC_KEY=                    # required — webhook signature verification (Ed25519)
  TELNYX_MESSAGING_PROFILE_ID=          # required — purchased numbers are auto-attached
  TELNYX_VOICE_APP_ID=                  # required — purchased numbers are auto-attached
  TELNYX_CONNECTION_ID=                 # required for stage 2 — WebRTC credential generation
  TELNYX_DEFAULT_NUMBER=                # dev-only fallback; unused in prod (see stage 1.5)
  SENDGRID_API_KEY=
  SENDGRID_WEBHOOK_PUBLIC_KEY=          # for event-webhook signature verification
  SENDGRID_FROM_DOMAIN=                 # e.g. mail.roofaid.app
  NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=
  ```
- [ ] **Two demo phone numbers** that the QA team controls (one to play "homeowner", one to play "agent"). Outbound Telnyx number → demo phone for two-way SMS test

> **Do not start Stage 2 until Stage 1's webhook is live** — the softphone needs the webhook to forward inbound calls. Skipping this means hours of "why isn't my test call ringing?"

---

## 5. Key architectural decisions for M4

### 5.1 Telnyx WebRTC on web, native dial on mobile

Web Telefonistas use Telnyx's browser SDK (`@telnyx/webrtc`) — full softphone with mute, hold, transfer, recording. Mobile Ruferos keep the M3 hand-off pattern (`tel:` URI opens the device dialer). In-app mobile calling via Telnyx is technically possible but adds 3 days of CallKit/ConnectionService work for marginal field-ops benefit; field Ruferos prefer their phone's speakerphone + bluetooth headsets anyway.

**Why:** Maximum value where it matters (the Telefonista's all-day workflow), zero added complexity where it doesn't (Ruferos do <5 calls/day from the field).

### 5.2 One Edge Function per provider, route by event

`telnyx-webhook` and `sendgrid-webhook` are single endpoints that switch on `event_type`. Easier to deploy, easier to monitor, easier to test. Each function:

1. Verifies the HMAC signature against the provider's public key — reject with 401 if bad
2. Logs the raw event to `webhook_events` for replay/debug
3. Switches on event type → handler
4. Returns 200 within 5 seconds (both providers retry on timeout — slow handler causes duplicate events)

Long-running work (PDF stamping, photo processing) is enqueued on a `tasks` table, not done inline.

**Why:** Webhooks are the most stateful and most fragile part of the system. Centralization makes audit trivial and replay surgical.

### 5.3 Idempotency keys on every external event

`call_logs`, `sms_logs`, `email_logs` each carry a `provider_event_id TEXT UNIQUE`. The webhook does an `INSERT ... ON CONFLICT DO NOTHING` keyed on that id. Telnyx and SendGrid both retry on any non-2xx (or even on slow 2xx) — without idempotency you'll see duplicate call records every time the function cold-starts.

**Why:** "I called this prospect 3 times" when really we got 3 webhook redeliveries is a trust-killer.

### 5.4 `can_call()` and `can_message()` are RPC, not client-side checks

Two SQL functions in the database are the **single source of truth** for "may we contact this prospect right now":

- `can_call(prospect_id UUID) RETURNS jsonb` — returns `{allowed: bool, reason: text}`. Reasons: `dnc`, `outside_calling_hours`, `no_phone`, `ok`.
- `can_message(prospect_id UUID) RETURNS jsonb` — same shape.

Every Call / SMS button in web + mobile calls this RPC before initiating. Disabled buttons show the reason in a tooltip. The webhook's outbound path also calls these RPCs — defense in depth.

**Why:** TCPA fines are $500–$1,500 per call. A single missed check costs more than the entire M4 sprint. Putting the check in SQL means it runs on every code path, including admin-only debug tools we forget to lock down.

### 5.5 Calling hours = tenant timezone, not server UTC

`tenants.calling_hours` is `jsonb`: `{mon: {start: "08:00", end: "20:00"}, tue: ..., sun: null}`. `null` = no calls that day. `can_call()` resolves the prospect's current local time using `tenants.timezone`, not the server's clock.

**Why:** The TCPA limit is "8am–9pm in the *called party's* timezone" — but for v1 we use the tenant timezone (their service area is regional, single timezone). Cross-timezone tenants get a follow-up upgrade.

### 5.6 SMS STOP keyword auto-DNC happens in the webhook before reply

Inbound SMS body matches `/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i` → set `prospect.do_not_call = true`, insert `dnc_records` row with reason `'sms_stop_keyword'`, send auto-reply *"You've been unsubscribed. Reply START to opt back in."* (TCPA-required acknowledgement). All in one transaction inside the webhook — never relies on a UI to enforce this.

**Why:** The carrier's compliance teams test this exact path. A response delay of more than ~30s gets the messaging profile flagged.

### 5.7 Recording disclosure played by Telnyx, not us

The "this call may be recorded" prompt is a Telnyx **Call Control Application** AnswerMachineDetection pre-roll — configured per tenant via `tenants.recording_disclosure_audio_url`. Default to a Telnyx-hosted neutral message. Tenants on Tier 2+ can upload custom audio.

**Why:** Recording disclosure must be **before** the agent speaks. Doing it in the WebRTC client introduces a race where the agent talks during the disclosure. Telnyx's call-control API handles the timing for us.

### 5.8 Mobile SMS sends through an RPC, not the Telnyx SDK

Flutter doesn't get the Telnyx SDK. Sending an SMS calls `supabase.rpc('send_sms', { prospect_id, body })`. The RPC:
1. Calls `can_message(prospect_id)` — reject if not OK
2. Inserts pending row into `sms_logs`
3. Calls Telnyx Messaging API via Edge Function
4. Updates row with `provider_message_id`

**Why:** Keeps mobile dependency-free, keeps DNC enforcement server-side, makes the same code path testable from web.

### 5.9 Notification bell uses the existing `notifications` table

We don't add a new table. M4-10 is purely a UI consumer of what M3 already populates. Stage 6 adds: nav-bar component, subscription, mark-read mutation, deep-link router.

**Why:** One table, many producers.

### 5.10 Templates are tenant-scoped JSONB, not a separate table

`tenants.sms_templates` and `tenants.email_templates` are `jsonb[]`: `[{id, name, body, active}, ...]`. The schema is intentionally simple and lives inside the tenant row. M7 adds the management UI; M4 just needs *read*.

**Why:** Templates are config, not data. Putting them in `jsonb` avoids 4 tables for a feature most tenants will use ~5 templates of.

---

## 6. Definition of Done

### Web — Phone
- [ ] Telefonista logged in → softphone visible in dashboard chrome with mic selector + level meter
- [ ] Click "Call" on any prospect card → softphone dials → call connects → recording prompt plays once before agent's first word
- [ ] Mute / Hold / Transfer / Hangup all functional
- [ ] After hangup → disposition modal blocks navigation until selected → row inserted into `call_logs` with disposition + duration + recording URL
- [ ] Inbound call to the tenant's Telnyx number rings the assigned agent's browser tab with caller ID + Accept/Reject banner
- [ ] Connection status dot in nav bar reflects WebRTC state (connecting / live / error)

### Web — SMS
- [ ] Click "SMS" on any prospect → side panel opens with full conversation thread
- [ ] Compose box with character count + segment counter (160-char SMS / 70-char Unicode)
- [ ] Templates dropdown loads from `tenants.sms_templates` and inserts text
- [ ] Sent message appears in thread within 1 second; delivery status updates from `sent` → `delivered` (or `failed`) via webhook
- [ ] Inbound SMS appears in real time (Realtime subscription on `sms_logs`)
- [ ] Reply with "STOP" → prospect auto-flagged DNC, auto-reply sent, all logged

### Web — Email
- [ ] Compose modal opens from prospect → To pre-filled, Subject, Body (markdown or rich-text), Template dropdown
- [ ] Send → row appears in `email_logs` as `queued`
- [ ] SendGrid event webhook updates status to `delivered` / `bounced` / `spam_reported`
- [ ] Inbound email (reply to a sent email) parses and shows up under the prospect's Email tab

### Web — DNC + Calling Hours
- [ ] Call button on a DNC-flagged prospect is disabled with tooltip "DNC flagged on YYYY-MM-DD — call blocked"
- [ ] Call button outside calling hours is disabled with tooltip "Outside calling hours (08:00–20:00 America/Chicago)"
- [ ] Calling-hours config UI works: owner edits tenant settings → save → behavior changes immediately
- [ ] SMS STOP keyword test: reply STOP from the QA homeowner phone → within 30 seconds the prospect appears DNC in the UI

### Web — Notifications
- [ ] Bell icon in nav bar shows correct unread count, updates without refresh
- [ ] Click bell → dropdown with last 20 notifications, newest first
- [ ] Click a notification → navigates to the related record, marks as read
- [ ] "Mark all read" button works

### Mobile
- [ ] Rufero opens an assigned prospect's SMS tab → sees full thread, newest at bottom
- [ ] Reply composer sends → appears in thread → web user sees it appear in real time
- [ ] App icon badge or in-app red dot reflects unread SMS count
- [ ] DNC + calling-hours respected on mobile too (server-side RPC means there's nothing to forget)

### Cross-cutting
- [ ] All call recordings live in `call-recordings/{tenant_id}/...` and are inaccessible cross-tenant
- [ ] Webhook signature verification rejects forged payloads (test by hand with `curl`)
- [ ] Webhook idempotency: replay the same Telnyx event 3× → exactly 1 row in `call_logs`
- [ ] No raw API keys in client bundle (`grep -r TELNYX_API_KEY apps/web/.next/static`)
- [ ] `.env.example` updated; secrets in Supabase Vault, not env

---

## 7. Out of scope for M4 (deferred)

- **AI calling** (Tier 3 feature) → M-future
- **Call transcript / sentiment** → not on roadmap; revisit in M-future
- **Email rich-text editor with images / attachments** → M5 brings doc attachments; M4 ships plain rich text only
- **Inbound call IVR / queue** → single agent extension routing only; "press 1 for sales" lands when needed
- **Mobile in-app calling** → stays as `tel:` hand-off
- **Calling-hours per-prospect timezone** → uses tenant timezone for v1
- **SMS group conversations** → 1:1 only

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Telnyx WebRTC SDK breaks under Safari / Firefox | Medium | High | Chrome/Edge only for Telefonistas at launch; documented requirement; fallback to "use Chrome" banner if the SDK fails to init |
| Webhook delivery to Supabase Edge Function flaky on cold start | Medium | High | Idempotency keys + retry-friendly handlers; monitor cold-start P99 in Supabase logs; alert on > 5s |
| TCPA fine for a missed DNC | Low | **Critical** | `can_call()` RPC at every dial site + database CHECK constraint; calling-hours enforced at DB level too; manual audit script that scans `call_logs` for any DNC violation post-fact |
| SendGrid bounce rate > 5% triggers reputation damage | Medium | Medium | Pre-flight "validate email format" via a free validation library; suppress retries on hard bounces; weekly bounce-rate dashboard for owners |
| Recording storage costs balloon | Low | Medium | Lifecycle policy on `call-recordings` bucket: archive to cold tier after 90d, delete after 1y; tenant-configurable in M7 |
| Test phone numbers run out of credits during demo | Low | Medium | Buy $50 of Telnyx credit before demo week; monitor balance |

---

## 9. Execution order

1. **Pre-reqs**: provider accounts + numbers + webhook URLs + signing secrets in Vault
2. **Stage 1** — comms foundation: schema migrations, RPCs, webhook skeletons, Vault wiring. Must ship first.
3. **Stage 2** — web softphone: highest visible payoff; uses Stage 1 webhook for inbound
4. **Stage 3** — web SMS: independent surface, parallelize with Stage 2 if a second pair of hands
5. **Stage 4** — web email: independent surface, parallelize as above
6. **Stage 5** — DNC + calling hours: ties Stages 2–4 together; lands once they exist
7. **Stage 6** — notification bell: light UI work, near-end
8. **Stage 7** — mobile SMS: depends on Stage 3 RPC contract; lands after web SMS is live

Estimated total: **8–10 days** end-to-end (Week 5 + buffer days).

---

## 10. Success demo script (for client)

Eight minutes, scripted:

1. Log in as `telefonista@demo.com` → softphone visible in nav, "online" green dot
2. Click any prospect card → click **Call** → softphone dials → demo homeowner's phone rings → answer → recording prompt plays → 5-sec conversation
3. Hang up → disposition modal blocks → select "Answered → Callback Requested" → confirm a row appeared on the prospect's **Calls** tab with playable recording
4. From the same prospect → click **SMS** → side panel → type "Hi, this is Jordan from Roof-Aid, do you have a few minutes?" → send → message appears
5. From the demo homeowner phone → reply "Sure" → message appears in the web thread within 2 seconds
6. From the demo homeowner phone → reply "STOP" → within 5 seconds the prospect's row turns red with a DNC badge → Call + SMS buttons grey out everywhere
7. Try to click Call on the now-DNC prospect → button disabled, tooltip "DNC flagged today — call blocked"
8. Open tenant settings → set today's calling hours to 08:00–10:00 → it's 11am → all Call buttons grey out with "Outside calling hours" tooltip
9. From the prospect profile → click **Email** → compose with a "Roof inspection follow-up" template → send → row appears on Email tab with status `queued` → `delivered` within 30s
10. Notification bell shows an unread count from the inbound SMS earlier → click → list → click an entry → navigates to the prospect
11. Open the Flutter app as `rufero@demo.com` → open an assigned prospect → SMS tab → see the same thread → reply from mobile → web user sees it land in real time

If all 11 steps work end-to-end with real Telnyx + SendGrid traffic, M4 is done.
