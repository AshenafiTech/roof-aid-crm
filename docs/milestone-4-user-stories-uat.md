# Milestone 4 — UAT Guide

**Scope:** Phone, SMS, Email, Notifications. Reference: [milestone4/README.md](milestone4/README.md). **Time:** ~30 min.

## Setup
- Chrome/Edge with mic. A second "homeowner" mobile (US calls + SMS).
- Test prospect with that mobile as `phone` and a real email you control.
- Tenant already has a purchased Telnyx number (super-admin provisioned).

## Accounts
| Role | Email | Pwd |
|---|---|---|
| Owner | `ashenafigodanaj@gmail.com` | `Demo1234!` |
| Telefonista | `telefonista@gmail.com` | (separate) |
| Rufero | `rufero@gmail.com` | (separate) |

## Accepted deviations (confirm by signing)
1. **No signup wizard / 10DLC automation.** Tenants are super-admin provisioned. `/onboarding` is a single-step number picker — no EIN/sample-messages, no calling-prefs step, no 10DLC banner.
2. **Email = per-user Gmail OAuth**, not SendGrid. No inbound parse, no delivery webhook.
3. **DNC is informational** (carry-over from M3-6). Buttons stay enabled with warning tooltip. STOP auto-DNC deferred.
4. **Calling-hours config + hard enforcement deferred.**
5. **Mobile SMS reply (M4-11) deferred** with rest of Flutter.
6. **Call recording + disposition modal (M4-3/4) deferred.** Calls connect; nothing is stored to `call-recordings/` and no modal blocks after hangup.

---

## M4-0 — Onboarding & tenant number

**M4-0.1 — Pick a number on `/onboarding`**
1. Log in as new Owner → land on `/onboarding`.
2. Confirm single card "Pick your business line" (no wizard fields).
3. Search by area code (e.g. `479`) → pick → **Buy & continue**.

Expected: green confirmation with E.164, label, capabilities (`VOICE/SMS`). `/admin/settings/phone-numbers` lists it `is_primary=true, status=active`. Re-visiting `/onboarding` shows the same confirmation, not the picker.

☐ Pass ☐ Fail — Issues: ____

**M4-0.2 — No missing-number banner after purchase**
Log in as Telefonista → visit `/prospects`, `/phone`, `/sms`. No "missing number" banner; dialer shows tenant caller ID.

☐ Pass ☐ Fail — Issues: ____

---

## M4-1 / M4-2 — Softphone & click-to-call

**M4-1.1 — Status indicator**
Log in (Chrome/Edge), allow mic, open `/phone`. Status: `connecting → live` (green) within ~5s. Mic-denied shows clear error.

☐ Pass ☐ Fail — Issues: ____

**M4-1.2 — Outbound call (dial pad)**
Type homeowner number → green **Call** → answer → talk 5s → **Mute** (homeowner hears nothing) → unmute → **Hangup**.

Expected: ring within 3s; caller ID = tenant Telnyx number; clean two-way audio; mute one-way; hangup ends both sides.

☐ Pass ☐ Fail — Issues: ____

**M4-2.1 — Click-to-call from prospect**
Click **Call** on the row, then side panel, then detail action bar.

Expected: each dials via softphone (no `tel:`, no new tab); caller ID = tenant number; each completed call appears on Calls/Activity tab with timestamp + duration.

☐ Pass ☐ Fail — Issues: ____

**M4-2.2 — Inbound call rings browser**
From homeowner phone, dial tenant number → click **Accept** in browser banner → 5s call → hang up.

Expected: banner within 3s with caller ID; two-way audio on accept; row in `call_logs`; reject ends cleanly. *Mark Fail + "deferred" if inbound webhook routing isn't live.*

☐ Pass ☐ Fail — Issues: ____

---

## M4-6 — Web SMS

**M4-6.1 — Send SMS**
Open prospect → **SMS** → type "Hi, this is Roof-Aid testing." → watch char/segment counter past 160 → **Send**.

Expected: counter flips to 2 segments around 161; bubble appears <1s as `sent`; homeowner receives within ~10s from tenant number; status → `delivered`.

☐ Pass ☐ Fail — Issues: ____

**M4-6.2 — Inbound SMS realtime**
Keep thread open → reply "Got it" from homeowner phone.

Expected: appears in thread automatically with timestamp; also lands on `/sms` and prospect record if thread wasn't open; `inbound_sms` notification fires.

☐ Pass ☐ Fail — Issues: ____

**M4-6.3 — DNC + STOP (deviation check)**
Quick-flag DNC → hover SMS (tooltip "DNC Flagged — message with caution") → send (succeeds) → reply `STOP` from homeowner.

Expected: send not blocked; STOP appears in thread; prospect **not** auto-flagged (manual flagging required).

☐ Pass ☐ Fail — Issues: ____

---

## M4-7 — Email (Gmail OAuth)

**M4-7.1 — Connect Gmail**
As Telefonista, `/email` → **Connect Gmail** → OAuth (grant `gmail.send`) → return.

Expected: page shows connected Google email + **Disconnect**; composer enabled; Rufero on `/email` sees role-gated placeholder.

☐ Pass ☐ Fail — Issues: ____

**M4-7.2 — Send email**
Open prospect (real email) → composer → Subject + Body → **Send**.

Expected: row in prospect Email log as sent; recipient receives from connected Gmail (not no-reply); same email in Telefonista's Gmail Sent; revoked-token retry shows reconnect prompt (no silent fail).

☐ Pass ☐ Fail — Issues: ____

---

## M4-9 — DNC

**M4-9.1 — Tooltip on every comms surface**
Flag DNC → hover Call + SMS on row, side panel, detail action bar, dialer/composer.

Expected: every Call tooltip "DNC Flagged — call with caution"; every SMS "…message with caution"; all buttons clickable.

☐ Pass ☐ Fail — Issues: ____

**M4-9.2 — Calling hours**: deferred. Mark **N/A**.

---

## M4-10 — Notifications

**M4-10.1 — Bell**
Trigger event (inbound SMS, or Owner reassigns lead) → watch bell → click → click a row → **Mark all read**.

Expected: badge increments without refresh; dropdown lists 20 newest (icon, title, relative time); row click opens detail dialog (type badge, body, exact timestamp, View details); View details navigates + marks read; Mark all read → 0.

☐ Pass ☐ Fail — Issues: ____

**M4-10.2 — Notifications page**
`/notifications` → apply type filter + unread-only → refresh → click row → **Delete**.

Expected: filters in URL, survive refresh; pagination with page numbers, prev/next, "Showing X–Y of Z"; delete updates counts; clean empty state.

☐ Pass ☐ Fail — Issues: ____

---

## Cross-cutting

**M4-X.1 — Tenant isolation**
Note Tenant A SMS thread URL → log in as Tenant B Owner → paste URL.

Expected: 404 / empty / not-found; no A data in any B list.

☐ Pass ☐ Fail — Issues: ____

**M4-X.2 — Webhook idempotency (engineer, optional)**
In Telnyx Mission Control, replay a recent event 2×. Expected: exactly 1 row in `call_logs`/`sms_logs` per real event.

☐ Pass ☐ Fail — Issues: ____

---

## Sign-off

| Section | Result |
|---|---|
| M4-0 Onboarding & number | ___ Pass / ___ Fail |
| M4-1/2 Softphone & click-to-call | ___ Pass / ___ Fail |
| M4-6 SMS | ___ Pass / ___ Fail |
| M4-7 Email (Gmail) | ___ Pass / ___ Fail |
| M4-9 DNC | ___ Pass / ___ Fail |
| M4-10 Notifications | ___ Pass / ___ Fail |
| M4-X Cross-cutting | ___ Pass / ___ Fail |
| M4-9.2 Calling hours / M4-11 Mobile SMS / M4-3/4 Recording+Disposition | **N/A — deferred** |

Tester: ____________________  Date: __________
Client sign-off: ____________________  Date: __________
