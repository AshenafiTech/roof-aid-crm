# Milestone 4 — Communication: Phone / SMS / Email
**Goal:** Turn the placeholder Phone, SMS, and Email pages into real communication tools — softphone, two-way SMS, email send/receive — with DNC and calling-hours compliance enforced at every layer.

## 1. Why this milestone matters

M2 built the prospect pipeline. M3 added maps and DNC flagging. But until M4 ships, every Call / SMS / Email button in the app is a stub — the CRM cannot actually contact a prospect.

M4 is the milestone where the platform stops being a record-keeping tool and becomes a **dialing-and-texting workstation**. It is also the first milestone with regulatory exposure: TCPA violations cost $500–$1,500 per call, so DNC + calling-hours enforcement must land **with** the dialer, not after it.

---

## 2. What's being implemented (scope)

| # | Task | Surface | What ships |
|---|------|---------|-----------|
| M4-1 | WebRTC softphone | Web | Telnyx WebRTC client mounted in the dashboard layout — mic selector, voice-level meter, dialer, mute / hold / transfer / hangup, incoming-call banner, connection-status pill in nav, debug log panel |
| M4-2 | Click-to-call | Web | Call button on the prospect row, side panel, and detail page pre-populates the dialer and starts the call. Outbound caller ID = agent's Telnyx extension |
| M4-3 | Call disposition | Web | After hangup: modal asks Answered / No Answer / Voicemail / Wrong Number / DNC Request / Callback Requested. Saves to `call_logs` + writes a `call` activity |
| M4-4 | Call recording | Web + Storage | Every call recorded to `call-recordings/{tenant_id}/{call_id}.mp3`. Recording disclosure played at call start (configurable per tenant) |
| M4-5 | Telnyx webhook | Edge Function | `supabase/functions/telnyx-webhook` — routes inbound calls to the right agent's WebRTC session, routes inbound SMS to the right tenant/prospect, persists call/SMS state changes |
| M4-6 | SMS module | Web | Threaded conversation per prospect, agent's personal extension as sender, message templates, character + segment counter, delivery status, **STOP keyword auto-flags DNC** |
| M4-7 | Email module | Web | Compose (To pre-filled, Subject, rich text Body), send via SendGrid subuser, per-document email templates, all sends logged to `email_logs` |
| M4-8 | SendGrid webhook | Edge Function | `supabase/functions/sendgrid-webhook` — parses inbound email replies, handles bounces (marks email invalid), handles spam complaints |
| M4-9 | DNC + calling-hours enforcement | Web + Mobile | Server-side guard: refuses to dial DNC prospects, refuses to dial outside the prospect's local 8am–8pm window (configurable per tenant per day). Auto-DNC on inbound STOP. Every DNC event logged permanently |
| M4-10 | Notification bell | Web | Bell icon in nav with realtime unread count from `notifications`, dropdown of recent items, mark-as-read, click navigates to related record |
| M4-11 | Mobile SMS reply | Mobile (Flutter) | Threaded SMS view per assigned prospect, reply from device, unread badge |

---

## 3. Current state — what's already in place

- **Tables:** `call_logs`, `sms_logs`, `email_logs`, `notifications` ([supabase/migrations/002_core_tables.sql:125-168](../../supabase/migrations/002_core_tables.sql#L125-L168))
- **Activity types:** `call`, `sms`, `email`, `dnc` already accepted by the activities check constraint
- **Realtime:** `notifications` and activity tables already in the publication (migration `007_enable_realtime.sql`)
- **DNC flag, reason, timestamp:** captured per prospect in M3 (informational only — M4-9 makes it enforced)
- **Stub pages:** [/phone](../../apps/web/app/(dashboard)/phone/page.tsx), [/sms](../../apps/web/app/(dashboard)/sms/page.tsx), [/email](../../apps/web/app/(dashboard)/email/page.tsx), [/communications](../../apps/web/app/(dashboard)/communications/page.tsx) — all placeholder stubs to be replaced

---

## 4. Pre-requisites (blockers — must be done before Stage 2)

- [ ] **Telnyx account** — provisioned DID(s), API key, WebRTC credentials, one extension per Telefonista (extension field on `users` may need a schema add)
- [ ] **SendGrid account** — parent API key with **subuser** capability so each tenant has its own sender
- [ ] **Sender domain DNS** — CNAME / SPF / DKIM verified in SendGrid (can take ~24h to propagate; start early)
- [ ] **Supabase storage bucket** — `call-recordings` (private, tenant-scoped path policy mirroring M1-3)
- [ ] **Recording disclosure copy** — legal text approved by client, configurable per tenant
- [ ] **Calling-hours defaults** — confirmed with client (default 8am–8pm prospect-local, configurable per tenant per day)

---

## 5. Execution plan — 7 stages

| Stage | Focus | Blueprint tasks |
|-------|-------|-----------------|
| 1 | Telnyx + SendGrid plumbing — provisioning, env vars, webhook signing-secrets, recording bucket | (prereqs for M4-5, M4-8) |
| 2 | WebRTC softphone shell — persistent client in nav, mic permissions, status pill, dialer UI | M4-1 |
| 3 | Outbound call flow — click-to-call → disposition → recording upload | M4-2, M4-3, M4-4 |
| 4 | Inbound routing — `telnyx-webhook` Edge Function, agent extension matching, incoming-call banner | M4-5 |
| 5 | SMS module — threaded view, templates, segment counter, STOP → DNC | M4-6 |
| 6 | Email module — compose, send, templates, SendGrid webhook (inbound + bounce + complaint) | M4-7, M4-8 |
| 7 | Compliance + bell + mobile SMS — server-side guards, notification bell, Flutter SMS reply | M4-9, M4-10, M4-11 |

Stage 1 unblocks everything. Stages 4 and 5 can run in parallel with Stage 3. Stage 7 is last.

---

## 6. Key architectural decisions for M4

### 6.1 Softphone is a single persistent client component
The Telnyx WebRTC client is mounted once in the dashboard layout, exposed via a small store so any page can call `dial(number)` without re-initializing the SIP session.

**Why:** WebRTC sessions take 1–2s to register. Re-mounting per page would break inbound calls.

### 6.2 Telnyx webhook is the source of truth for `call_logs`
Outbound dial **starts** with a server action (auth + DNC + calling-hours check), but the webhook is the only writer of call rows. The browser only writes the disposition.

**Why:** If the tab closes mid-call, the webhook still completes the row. Browser-driven writes produce missing/duplicate rows.

### 6.3 DNC + calling-hours are enforced server-side
Every server action (`startCall`, `sendSms`) re-checks `do_not_call` and the prospect's local-time window before invoking Telnyx. The UI grey-out is a hint, not the gate.

**Why:** Client-side disable is bypassable. TCPA fines apply regardless.

### 6.4 Recording disclosure is configured in Telnyx, not the browser
Plays before connect, identically for every agent. Per-tenant copy is supplied as an audio asset.

**Why:** Single audited path; cannot be disabled by a hostile agent.

### 6.5 SMS + email templates are tenant-scoped and editable
New `message_templates` table — `tenant_id`, `kind ('sms' | 'email')`, `name`, `body`, `variables jsonb`, `active`. Built in M4 so M5 appointment reminders can reuse it.

### 6.6 Notification bell is read-only realtime
Subscribes to `INSERT` on `notifications` filtered by `recipient_id = auth.uid()`. Mark-as-read is a server action that updates `read_at`. Same pattern as M2 Stage 5.

---

## 7. Definition of Done

- [ ] Click **Call** on any prospect → softphone dials → audio bidirectional
- [ ] Hangup → disposition modal → row in `call_logs` with recording URL
- [ ] Recording playable from the prospect's **Calls** tab
- [ ] Inbound call to a tenant DID rings the assigned agent's softphone with caller ID
- [ ] Two-way SMS thread on the prospect's **SMS** tab; segment counter accurate
- [ ] Inbound **STOP** auto-flags DNC + logs activity
- [ ] Email compose → send via SendGrid → row in `email_logs` → inbound reply parsed
- [ ] Bounce / spam-complaint events update `email_logs.status`
- [ ] Calls outside the calling-hours window are blocked **server-side** with a clear error
- [ ] DNC prospects: server action refuses Call/SMS regardless of UI state
- [ ] Notification bell shows live unread count; mark-as-read works; deep-link navigates
- [ ] Mobile (Flutter): Rufero replies to an SMS for an assigned prospect; thread visible
- [ ] All new env vars documented in `.env.example`
- [ ] RLS verified: Tenant A agent cannot read Tenant B's call/SMS/email rows
- [ ] No raw Telnyx or SendGrid keys in client bundles

---

## 8. Out of scope for M4 (deferred)

- AI calling agent (Tier 3 paid feature) → post-launch upsell
- Call transcription / sentiment analysis → post-launch
- Email rich-text editor with images → M7
- Voicemail drop / pre-recorded messages → M7
- SMS MMS (image attachments) → post-launch
- Stripe billing for per-call costs → M8
- Mobile inbound call **answering** on Flutter → M6 (needs push + CallKit / ConnectionService)

---

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Telnyx WebRTC blocked by corporate firewalls (UDP) | Telnyx TURN servers — verify behind-NAT in Stage 2 |
| Recording-consent law varies by US state (one- vs two-party) | Default to two-party disclosure; per-tenant toggle in M7 |
| TCPA: accidental dial outside calling hours | Server-side guard (Decision 6.3) is the gate |
| SendGrid domain auth takes ~24h | Run prereq DNS as Day-1 task, before Stage 6 |
| Inbound call routes to wrong agent (extension mismatch) | "Ring all" fallback in Stage 4 if extension lookup fails |
| Browser denies microphone permission silently | Permission-state indicator + recovery copy in Stage 2 |
| STOP keyword in non-English (`PARE`, `BAJA`) | Tenant-configurable keyword list; default English + Spanish |

---

## 10. Execution order

1. Pre-reqs (Section 4)
2. Stage 1 — plumbing
3. Stage 2 — softphone shell
4. Stage 3 — outbound call flow (parallel with Stage 4)
5. Stage 4 — inbound webhook
6. Stage 5 — SMS module (parallel with Stage 4 once Stage 1 done)
7. Stage 6 — email module (depends only on Stage 1)
8. Stage 7 — compliance, bell, mobile SMS

---

## 11. Demo script (end-of-milestone sign-off)

1. Log in as Telefonista → softphone status pill reads **Connected**
2. From `/prospects`, click **Call** on a non-DNC prospect → call connects → audio works
3. Hang up → disposition modal → **Answered** → recording playable in Calls tab
4. Try **Call** on a DNC prospect → server-side refusal with toast
5. Roll the test clock to 9pm prospect-local → **Call** → blocked with calling-hours error
6. Open prospect's **SMS** tab → send a message → reply from test number → thread updates live
7. Send **STOP** from the test number → prospect auto-flagged DNC, activity logged
8. From `/email`, send a templated email → reply lands in Email tab → bounce simulator marks bounced
9. Notification bell lights up for inbound SMS / email / missed call → click → navigates to prospect
10. Open Flutter app as Rufero → reply to an unread SMS for an assigned prospect → web sees it live

All 10 = M4 signed off.

---

## 12. Acceptance & sign-off

A separate UAT document (`milestone-4-user-stories-uat.md`, modeled on [milestone-3-user-stories-uat.md](../milestone-3-user-stories-uat.md)) will be filed at the end of M4. It will list one user story per task ID (M4-1 … M4-11) with explicit Pass / Fail check-boxes and any approved deviations from the blueprint.
