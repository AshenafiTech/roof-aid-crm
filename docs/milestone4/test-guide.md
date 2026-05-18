# Milestone 4 — Test Guide

**Audience:** QA / product reviewers running end-to-end checks before sign-off.
**Source of truth for scope:** [docs/milestone4/README.md](README.md).
**Source of truth for implementation:** the `feat/milestone-4-next` branch (this guide is calibrated to that branch).

This guide differs from the M4 README in two important ways — read these before you start so you don't chase ghosts:

1. **Email pivoted from SendGrid → Gmail (OAuth).** Gmail send works; there is **no inbound parsing or bounce/spam webhook yet**. Skip every step that mentions SendGrid.
2. **DNC + calling-hours are soft warnings, not hard blocks.** The README says "Call button on a DNC-flagged prospect is disabled." In the current build the button stays clickable and a confirmation dialog explains the reason; the agent can override by acknowledging. Test that the dialog appears and that the override path logs `acknowledgedWarnings`, not that the button is disabled.

The "Known gaps" section at the bottom lists every checklist item from the README's Definition of Done that is **not testable yet** so you can mark them N/A on the QA report instead of failing them.

---

## 1. Pre-flight

Don't start manual testing until all of these are green. A bad webhook URL or missing Vault secret will produce confusing failures that waste hours.

### 1.1 Provider accounts + numbers

- [ ] Telnyx account active with credit balance > $20 (calls + SMS will fail silently if the balance hits zero — symptom: webhook never fires)
- [ ] One Telnyx **Messaging Profile** named "Roof-Aid" exists; record its ID for `TELNYX_MESSAGING_PROFILE_ID`
- [ ] One Telnyx **Voice / Call Control Application** named "Roof-Aid" exists; record its ID for `TELNYX_VOICE_APP_ID`
- [ ] Webhook URL on **both** the Messaging Profile and the Call Control App is `https://<project>.supabase.co/functions/v1/telnyx-webhook`
- [ ] At least one Telnyx number is purchased and assigned to the test tenant (purchase via Settings → Phone Numbers, see §6.7)
- [ ] Google Cloud project has Gmail OAuth client; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` populated
- [ ] Two demo phones under QA control: **"homeowner phone"** (will receive calls and SMS, will reply STOP) and **"agent phone"** (only used if you test inbound calls without WebRTC)

### 1.2 Supabase Vault secrets

Vault, **not** env vars. If these are in env only, signature verification will reject every webhook with 401:

- [ ] `TELNYX_PUBLIC_KEY` — Ed25519 public key for webhook signature verification
- [ ] `TELNYX_API_KEY` — V2 API key (for outbound API calls)

### 1.3 Env vars (`.env.local`)

```
TELNYX_API_KEY=
TELNYX_PUBLIC_KEY=
TELNYX_MESSAGING_PROFILE_ID=
TELNYX_VOICE_APP_ID=
TELNYX_CONNECTION_ID=
TELNYX_DEFAULT_NUMBER=        # dev fallback only
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=
```

### 1.4 Database state

Verify with a quick SQL session against the test database:

- [ ] Migrations `010` through `021` applied (comms schema, `can_call`/`can_message` RPCs, `dnc_records`, `webhook_events`)
- [ ] Test tenant has `timezone` set (e.g. `America/Chicago`)
- [ ] Test tenant has `calling_hours` set to permissive values for now (`{mon..sun: {start:"00:00", end:"23:59"}}`) — you'll tighten it later in §6.4
- [ ] Test tenant has at least one row in `tenant_phone_numbers` with `is_active = true`, `voice_capable = true`, `sms_capable = true`
- [ ] Storage bucket `call-recordings` exists and is **private**

### 1.5 Demo accounts

Create or reuse these roles on the test tenant:

| Role | Email | What you'll test as them |
|---|---|---|
| Owner | `owner@demo.com` | Phone-number purchase, settings |
| Telefonista | `telefonista@demo.com` | Softphone, SMS, email, DNC overrides |
| Rufero | `rufero@demo.com` | Mobile (deferred — see §7) |

Make sure `telefonista@demo.com` has `users.telnyx_extension` populated — without it, inbound calls won't route to their browser.

---

## 2. Test environment setup

```bash
cd /home/ashe/Documents/work/roof-aid-crm/apps/web
pnpm install
pnpm dev
```

In a second terminal, tail the Supabase function logs so you can see webhook events as they arrive:

```bash
supabase functions logs telnyx-webhook --tail
```

Open a third terminal for ad-hoc DB checks:

```bash
psql "$DATABASE_URL"
```

---

## 3. Phone (M4-1, M4-2, M4-4, M4-5)

### 3.1 Softphone initialization (M4-1)

**Where:** persistent softphone bar in the dashboard chrome — see [apps/web/components/comms/softphone.tsx](../../apps/web/components/comms/softphone.tsx).

1. Log in as Telefonista.
2. Confirm the softphone bar is visible at the bottom of the screen.
3. Confirm the connection-status dot transitions: `connecting` → `connected` (green) within ~3 seconds.
4. Open the mic selector — confirm at least one input device appears.
5. Confirm a level meter responds when you speak.

**Expect:** registration succeeds; status dot green.

**If status stays red:**
- Check `apps/web/app/api/telnyx/credentials/route.ts` returned a token (Network tab)
- Verify `TELNYX_CONNECTION_ID` matches your Telnyx Call Control App
- Verify the user has `telnyx_extension` populated

### 3.2 Click-to-call from a prospect (M4-2)

**Where:** Call button on any prospect row or detail panel — [apps/web/components/comms/call-button.tsx](../../apps/web/components/comms/call-button.tsx).

1. Open `/prospects` and click any prospect with a phone number.
2. Click **Call** on the detail panel.
3. **If the prospect has DNC = false and we're inside calling hours** → softphone dials the homeowner phone immediately.
4. Pick up on the homeowner phone.
5. Confirm:
   - Audio is two-way and clear
   - **Recording disclosure plays once** before the agent's first word (Telnyx pre-roll, configured per tenant)
   - Mute toggle works (homeowner phone confirms silence)
   - Hangup ends the call cleanly

**Expect:** a row appears in `call_logs` keyed on `telnyx_call_id` with `status = completed`. Query:

```sql
select id, status, direction, from_number, to_number, started_at, ended_at, recording_url
from call_logs
order by started_at desc limit 5;
```

> **Hold and Transfer are deferred** — UI buttons are stubs. Don't fail the test for missing functionality there.

### 3.3 Recording capture (M4-4)

After the §3.2 call ends, give the webhook ~30 seconds to deliver `call.recording.saved`, then:

```sql
select telnyx_call_id, recording_url
from call_logs
where telnyx_call_id = '<your call id>';
```

**Expect:** `recording_url` is populated with a Telnyx-signed URL. Open it in a browser to verify playback.

> **Recording playback UI is not built yet.** The "Calls tab" in the prospect detail does not yet render a player. Test ends at "URL is populated and the file plays in a browser tab." Don't fail for the missing in-app player.

### 3.4 Inbound call routing (M4-5)

1. Stay logged in as Telefonista in the browser.
2. From the homeowner phone, dial the tenant's Telnyx number.
3. Confirm:
   - Browser shows an **incoming-call banner** with caller ID and Accept / Reject
   - Accepting connects the call; the conversation is two-way
   - Rejecting plays a busy tone for the homeowner

**Expect:** `call_logs` row with `direction = inbound`, attributed to the right tenant via the called number.

### 3.5 Disposition modal (M4-3) — **deferred**

Not implemented. The README expects a blocking modal after hangup that writes `call_logs.disposition`. Currently `call_logs.disposition` stays NULL and no modal opens.

Mark this test **N/A** on the QA report.

---

## 4. SMS (M4-6)

### 4.1 Send and thread render

**Where:** SMS tab on the prospect detail page — [apps/web/components/comms/sms-composer.tsx](../../apps/web/components/comms/sms-composer.tsx) + [sms-thread.tsx](../../apps/web/components/comms/sms-thread.tsx).

1. Open a prospect whose `phone` is the homeowner phone.
2. Click **SMS** → side panel opens with empty thread.
3. Type "Hi this is a test from Roof-Aid" and confirm:
   - Character counter shows `34 / 160` (or `34 / 70` if you include a unicode char like an em-dash)
   - Segment counter shows `1 segment`
4. Click **Send**.
5. **Expect:**
   - Message appears in the thread within 1 second with status `queued`
   - Status updates to `sent` then `delivered` over 5–15 seconds (driven by Telnyx webhook)
   - `sms_logs` row exists with the right `from_number` (tenant primary number) and `to_number`

### 4.2 Templates dropdown

1. In the composer, open the templates dropdown.
2. Confirm at least the seeded template(s) from `tenants.sms_templates` appear.
3. Pick one — body should populate the textarea.

> **Template management UI is deferred to M7.** You can only **read** templates; if the tenant has none seeded, the dropdown is empty. Seed via SQL if needed:

```sql
update tenants
set sms_templates = '[{"id":"t1","name":"Intro","body":"Hi, this is Roof-Aid checking in.","active":true}]'::jsonb
where id = '<test-tenant-id>';
```

### 4.3 Inbound SMS

1. From the homeowner phone, reply "Sure thing".
2. Watch the thread in the browser without refreshing.
3. **Expect:** the message appears within 2 seconds via Realtime subscription.

### 4.4 STOP keyword auto-DNC (M4-9 cross-cut)

This is the highest-value SMS test — it's the TCPA path and what carrier compliance teams probe.

1. From the homeowner phone, reply exactly **"STOP"**.
2. Within ~30 seconds:
   - The homeowner phone receives the auto-reply: *"You've been unsubscribed. Reply START to opt back in."*
   - The prospect row in the web UI shows a red **DNC** badge
   - Querying `dnc_records` shows a new row with `reason = 'sms_stop_keyword'`
   - Querying `prospects.do_not_call` shows `true`

3. Try clicking **Call** on the same prospect. **Expect:** confirmation dialog with reason "DNC flagged on YYYY-MM-DD". Cancel — call is not placed.

4. Repeat with case + whitespace variants: `stop`, ` STOP `, `unsubscribe`, `cancel`. Each should trigger DNC.

5. Reply **"START"** from the homeowner phone. **Note:** opt-in flow is currently passive — the prospect stays DNC; agent must remove DNC manually via the toggle. That's by design (TCPA-safe default).

---

## 5. Email — Gmail (M4-7)

> **The README describes SendGrid; the code uses Gmail.** Read this section, not the README's M4-7/M4-8.

### 5.1 OAuth connect

**Where:** [apps/web/app/(dashboard)/email/page.tsx](../../apps/web/app/(dashboard)/email/page.tsx).

1. As Telefonista, navigate to **Quick Email** in the sidebar.
2. Click **Connect Gmail** — OAuth popup opens.
3. Approve the scopes.
4. Confirm redirect back to `/email` with a "Connected as `<email>`" indicator.
5. Confirm `user_google_tokens` has a row with a refresh token.

### 5.2 Send

1. Compose: To = a real email you can check, Subject = "M4 test", Body = "hello from m4".
2. Send.
3. **Expect:**
   - Toast confirms send
   - Inbox receives the email within ~30 seconds
   - `email_logs` has a row with `status = queued` (the status will not advance — see §5.3)

### 5.3 Bounce / inbound — **deferred**

The Gmail webhook / inbound parse / event status updates do **not** exist yet. `email_logs.status` will stay at `queued` forever in this build. Mark these README items N/A:

- "SendGrid event webhook updates status to `delivered` / `bounced` / `spam_reported`"
- "Inbound email parses and shows up under the prospect's Email tab"

---

## 6. DNC + calling hours (M4-9)

The RPC enforcement path is the most security-critical part of M4. Test it explicitly.

### 6.1 Manual DNC toggle

**Where:** [apps/web/app/(dashboard)/prospects/[id]/dnc-toggle.tsx](../../apps/web/app/(dashboard)/prospects/[id]/dnc-toggle.tsx).

1. Open a non-DNC prospect.
2. Toggle DNC on.
3. **Expect:** `dnc_records` row inserted, `prospects.do_not_call = true`, badge shown in UI.
4. Click **Call** — confirmation dialog explains DNC; cancel.
5. Toggle DNC off — confirm both columns flip back.

### 6.2 STOP-driven DNC

Already covered in §4.4. Don't re-run unless §4.4 was skipped.

### 6.3 Calling-hours soft warning

1. As Owner, set `tenants.calling_hours` for **today's day-of-week** to a window that does **not** include the current time. Easiest path is direct SQL since the UI is stubbed:

```sql
update tenants
set calling_hours = '{"mon":{"start":"00:00","end":"00:01"},"tue":{"start":"00:00","end":"00:01"},"wed":{"start":"00:00","end":"00:01"},"thu":{"start":"00:00","end":"00:01"},"fri":{"start":"00:00","end":"00:01"},"sat":{"start":"00:00","end":"00:01"},"sun":{"start":"00:00","end":"00:01"}}'::jsonb
where id = '<test-tenant-id>';
```

2. As Telefonista, click **Call** on a non-DNC prospect.
3. **Expect:** confirmation dialog with reason like "Outside calling hours (00:00–00:01 America/Chicago)". Cancel — call is not placed.
4. Override path: click **Call** again, confirm in the dialog, and verify the call still proceeds and `acknowledgedWarnings` is logged on the activity (server-side acknowledgement; check `call_logs` if a column tracks it, otherwise inspect `apps/web/lib/calls/actions.ts` to confirm the dialog accept path is wired).
5. Restore permissive `calling_hours` afterwards.

> **Calling-hours editing UI is deferred to M7.** The `/admin/settings` page links it as "Coming in M7" — don't fail the README's "Calling-hours config UI works" item.

### 6.4 RPC verdicts (defense-in-depth)

Even with the UI overrides, the RPC remains the source of truth. Spot-check it directly:

```sql
select can_call('<dnc-prospect-id>'::uuid);
-- expect: {"allowed": false, "reason": "dnc"}

select can_message('<no-phone-prospect-id>'::uuid);
-- expect: {"allowed": false, "reason": "no_phone"}
```

---

## 7. Mobile SMS (M4-11) — **deferred**

The SMS tab in the Flutter app at `apps/mobile/` is a placeholder showing "Inbound and outbound messages will appear here once Telnyx SMS is live (M4)." There is no datasource, repository, composer, or unread badge.

Mark every README mobile item **N/A**:
- Rufero opens prospect's SMS tab → sees full thread
- Reply composer sends → web sees it in real time
- App icon badge or in-app red dot reflects unread SMS count

The DNC + calling-hours items the README lists for mobile are enforced server-side via RPC, so they're effectively covered by the web tests in §6.

---

## 8. Notifications (M4-10)

**Where:** bell icon in nav bar — [apps/web/app/(dashboard)/notification-bell.tsx](../../apps/web/app/(dashboard)/notification-bell.tsx).

1. As Telefonista, open the bell — confirm dropdown renders the last 20 notifications, newest first.
2. Confirm the unread badge count matches `notifications.is_read = false` for that user.
3. Click any notification → confirm:
   - Page navigates to the related record (prospect / appointment / document)
   - The notification's unread state flips to read
   - The badge count decreases by one
4. Click **Mark all read** — count goes to zero.
5. Live-update test: insert a notification via SQL while the bell is open and confirm it appears within ~2 seconds without a page refresh:

```sql
insert into notifications (user_id, tenant_id, type, title, body, related_type, related_id, is_read)
values ('<telefonista-user-id>', '<tenant-id>', 'sms_inbound', 'Test', 'hello', null, null, false);
```

> **Producers are partial.** SMS inbound, call end, and email events do **not** yet auto-insert notifications. The bell is wired as a *consumer* but you'll see fewer notifications than the README implies. The manual SQL insert in step 5 is the most reliable way to verify the realtime path.

---

## 9. Tenant phone numbers (Stage 1.5)

**Where:** [/admin/settings/phone-numbers](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/page.tsx) — owner / admin only.

1. Sign in as Owner.
2. Navigate to **Settings → Phone Numbers**.
3. Click **Buy number** → search by area code → pick one → confirm purchase.
4. **Expect:** new row in `tenant_phone_numbers` with `is_active = true`, attached to the platform Messaging Profile and Voice App (verify in Telnyx dashboard).
5. Edit the label, then set as primary. Confirm `is_primary` flips on this row and off on any prior primary.
6. Buy a second number, then delete the second one. Confirm the row is hard-deleted (or `is_active = false` if soft-deleted — depends on the action's implementation).
7. Sign in as Telefonista and navigate to the same URL — **expect:** redirect or 403 (role-gated).

---

## 10. Webhook integrity (M4-5)

These are correctness guarantees you can't observe from the UI alone. Run them once per release.

### 10.1 Signature rejection

```bash
curl -X POST https://<project>.supabase.co/functions/v1/telnyx-webhook \
  -H "Content-Type: application/json" \
  -H "telnyx-signature-ed25519: deadbeef" \
  -H "telnyx-timestamp: $(date +%s)" \
  -d '{"data":{"event_type":"call.initiated"}}'
```

**Expect:** HTTP 401, no row in `webhook_events`.

### 10.2 Idempotency

Capture a real Telnyx call event from the function logs, then replay it 3 times via curl with the original signature + timestamp.

**Expect:** exactly **1** row in `call_logs` (or `sms_logs`) for that `provider_event_id`. The 2nd and 3rd attempts log to `webhook_events` but the upstream table de-dupes.

### 10.3 Webhook audit log

After a few calls + SMS, run:

```sql
select event_type, received_at, provider_event_id
from webhook_events
order by received_at desc limit 20;
```

**Expect:** every call and SMS event accounted for. `provider_event_id` is unique.

### 10.4 No API keys in client bundle

```bash
cd apps/web
pnpm build
grep -r "TELNYX_API_KEY\|TELNYX_PUBLIC_KEY\|GOOGLE_CLIENT_SECRET" .next/static
```

**Expect:** no matches.

---

## 11. Known gaps — mark these N/A on the QA report

These are README items that are **not implemented** in this build. Don't open bugs against them:

| README §6 item | Status | Why |
|---|---|---|
| Disposition modal blocks navigation | not built | M4-3 not started |
| Calls tab plays recording in-app | not built | M4-4 partial — URL captured, no player UI |
| Hold / Transfer | not built | M4-1 partial |
| SendGrid event webhook updates status | replaced | pivoted to Gmail; no Gmail event webhook |
| Inbound email parses to Email tab | not built | M4-8 not started |
| Calling-hours config UI | not built | "Coming in M7" |
| Email template dropdown wired | not built | tenants.email_templates exists but unused |
| Call button **disabled** for DNC / outside hours | replaced | now a confirmation dialog (soft warning); test the dialog instead |
| Mobile SMS thread, composer, badge | not built | M4-11 not started |
| Notification producers (SMS / call / email auto-insert) | partial | bell consumes; producers wired only sporadically |

---

## 12. Acceptance summary

For sign-off, the following must pass:

- [ ] §3.1, §3.2, §3.4 — softphone register, outbound call with recording disclosure, inbound call routing
- [ ] §3.3 — recording URL captured in `call_logs`
- [ ] §4.1, §4.3, §4.4 — SMS send, inbound thread render, STOP-keyword auto-DNC + auto-reply
- [ ] §5.1, §5.2 — Gmail OAuth connect + send (status stays `queued`, that's expected)
- [ ] §6.1, §6.3, §6.4 — manual DNC toggle, calling-hours soft warning, RPC verdicts
- [ ] §8 — notification bell renders, marks read, realtime update
- [ ] §9 — owner buys, labels, sets primary, deletes a number
- [ ] §10.1, §10.2, §10.3, §10.4 — webhook signature rejection, idempotency, audit log, no leaked secrets

Anything in §11 is acknowledged-deferred and does not block sign-off.

---

## 13. After-test cleanup

- Restore permissive `calling_hours` if you tightened them in §6.3.
- Remove DNC flag on test prospects you flipped in §4.4 / §6.1.
- Delete test phone numbers in §9 step 6 (or keep one for the next test cycle).
- Revoke the Gmail OAuth grant in your Google account if the test inbox is shared.
