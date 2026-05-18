# Roof-Aid dev workflow — geography, what works, what to test

**Situation in plain terms.** The developer (Ashenafi) lives in Ethiopia. The product owner (Robel) lives in the US. The product is sold to US roofing companies who text US homeowners. Three different countries, three different needs.

This doc is the practical playbook for getting solid testing done despite the gap.

## The actual issue we're solving

Most of Roof-Aid is testable from anywhere with a laptop and an internet connection — that's not the problem. The problem is **a small number of behaviors only US carriers (T-Mobile, AT&T, Verizon) can verify**. A dev in Ethiopia can run all the code, all the database, all the webhooks, but they can't dial a Verizon subscriber and confirm the audio is clean from the prospect's end. Only a US-based human with a US phone can.

So the workflow is split:

- **Dev does 95% of testing** with what's reachable from Ethiopia (Ethiopian phone, browser softphone, DB inspection, simulated webhooks)
- **Owner does periodic "real US" verification** with their US phone — the 5% that requires real US carriers

The trick is making sure that 5% lands at predictable checkpoints (not blocking daily dev cycles) and that what the dev tests at home is realistic enough that it'd catch most regressions before they reach the owner's verification.

---

## What's working right now

Everything in this list is testable **from Ethiopia today**, no special setup.

| Feature | How dev tests it from Ethiopia |
|---|---|
| Buy a phone number | Onboarding wizard works — costs $1/mo per number, dev can buy one for testing |
| Multi-tenant isolation | Two test tenants live, switch logins, verify data scoping |
| Send SMS US → Ethiopia | Open a prospect with `+251...` phone, click Send → message arrives on dev's phone |
| Receive SMS Ethiopia → US | Text from `+251...` to the tenant's `+1-512-...` number → appears in SMS thread real-time |
| STOP keyword auto-DNC | Text "STOP" from `+251...` → prospect auto-flagged, auto-reply sent |
| DNC override flow | Click Send on flagged prospect → confirm modal → message goes through, audited |
| Database isolation (RLS) | Sign in as Tenant 1 user, try to query Tenant 2 data, get nothing |
| Realtime updates | Two browser tabs open, send message in one, watch it appear in the other |
| Webhook signature verification | Existing curl tests confirm forged sigs are rejected |
| Per-tenant Telnyx connection isolation | Verified at the database layer; full test once softphone ships |

This is the bulk of M4. **It's all working.** The dev can iterate on any of this without touching the US side.

## What's NOT working today (and why)

| Not working | Reason | Who/what unblocks it |
|---|---|---|
| **Voice calls** (any direction) | Softphone code isn't written yet. Telnyx infra is set up, but the WebRTC SDK + UI haven't been added | Stage 2 code session — ~60-90 min of focused work |
| **SMS US → US** | T-Mobile (and AT&T) reject SMS from numbers without 10DLC registration. Carrier-side issue, not our code | Register 10DLC for the messaging profile — 1-3 business days for carrier approval |
| **Real US homeowner UX** (audio quality, message rendering on real US carrier) | Only verifiable on a real US phone | Owner does periodic walkthroughs |

The first two have known fixes — coding and registration. The third is structural and is solved by the owner workflow below.

---

## The dev workflow (Ethiopia)

### Daily cycle

```
Code → typecheck → deploy → test
```

**Test phone:** the dev's Ethiopian phone, which is already set up as a prospect (`+251939278100` mapped to a "Ashenafi Godana" prospect under Tenant 1).

**Coverage from Ethiopia:**
- Outbound flow → app fires → Telnyx accepts → Ethiopian phone receives ✅
- Inbound flow → Ethiopian phone texts US tenant number → webhook → DB → UI ✅
- Multi-tenant: switch logins (telefonista1 / telefonista2 / two owner accounts) and verify scope ✅
- Realtime: open two browser tabs as two users, send between them ✅

**What the dev SHOULDN'T be checking:**
- Whether US-to-US SMS actually delivers (10DLC blocks it; not their fault, not their concern)
- Whether the audio quality on a Verizon line sounds clean (only the owner can hear it)
- Whether a real US homeowner would feel the UX is smooth (US owner judges that)

### The dev's golden test (run after every meaningful change)

1. Sign in as `telefonista1@roof-aid-test.com` (Tenant 1 telefonista)
2. Open the "Ashenafi Godana" prospect
3. Send a test SMS → bubble appears, flips to delivered, real phone receives it
4. From the real phone, reply "Hi" → bubble appears in the thread within 3s
5. From the real phone, reply "STOP" → DNC flag flips, auto-reply received
6. Sign out, sign in as `telefonista2@roof-aid-test.com` (Tenant 2)
7. Verify Tenant 1's prospects, messages, etc. are NOT visible

If those 7 steps work, 95% of code-quality is verified.

## The owner workflow (US)

### Weekly cadence (~30 min)

The dev tags Robel asynchronously when there's a new feature ready for "real US" verification. Robel runs the checklist below at his own pace.

**The owner's checklist** (works on his US phone):

1. Open the staging URL → sign in as `ashenafigodanaj@gmail.com` (Tenant 1 owner)
2. Phone numbers settings → confirm at least 1 number active
3. Open any prospect → SMS tab → send a test message **to the owner's own US phone**
4. Confirm the message arrived on the US phone — and how it looks (sender shown, segment count, line breaks intact)
5. Reply from the US phone → confirm it shows in the thread within seconds
6. Reply "STOP" from the US phone → confirm DNC flag + auto-reply work end-to-end on US carrier
7. Once softphone ships: open a prospect, click Call → verify the US phone rings, audio is clean both directions
8. Note any issues with timestamp + screenshots in shared doc

**Timing:** 30 minutes maximum for the full pass. Done weekly or after any deploy that touches the comm flows.

### One-time "go-live" gate

Before any real US tenant onboards (paying customer):

- 10DLC sole prop registration approved for the messaging profile (1-3 day wait)
- Owner does the full checklist above with US-to-US verified working
- Owner does a real call to a friend's US phone, listens for echo / latency / drops

Until both pass, no real US tenant onboards.

---

## How to compress the geography gap

A few specific tools and habits that make the asymmetry less painful.

### Async-first communication

Time difference Ethiopia ↔ US is 8-11 hours. There's maybe 2-3 hours of overlap on any given day. Don't wait for synchronous calls to resolve issues.

- **Loom videos** when the owner needs to demonstrate a US carrier issue (faster than typing it out)
- **Screenshot + browser DevTools network tab** for any UI bug — pinpoints whether it's frontend or backend
- **Supabase Studio queries** for state verification — the owner can run them without dev help: `SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 10` shows recent activity from anywhere

### Cheap tooling that helps

| Tool | Purpose | Cost |
|---|---|---|
| **Telnyx Messaging Logs** (portal Debugging tab) | Both dev + owner can see exactly what Telnyx saw — same view from any country | free |
| **Supabase Dashboard** | Same DB, same Studio, both sides see the same state | free, included |
| **Loom** | Async video reports from owner | free tier |
| **Linear / GitHub Issues** | Track owner's QA findings without a sync call | free |

### Future: dev gets a virtual US phone (when needed)

If the dev hits a wall on US-only testing scenarios, options:
- **Twilio US number** ($1-2/mo) + their REST API to send/receive SMS programmatically
- **Telnyx US number** ($1/mo) attached to a different connection and used for testing only
- **Google Voice** — free for inbound SMS, US-residents-only for setup but works once provisioned

Skip this until it's actually a blocker. The dev workflow above covers most cases without it.

---

## How testing maps to milestones

| Milestone | What dev tests | What owner tests | Gating |
|---|---|---|---|
| M4 Stage 1.5 (number provisioning) | Onboarding flow buys a number, attaches to tenant connection | n/a — tested in code | ✅ done |
| M4 Stage 3 (Web SMS) | All SMS flows via Ethiopian phone | One real US-to-US test (after 10DLC) | ⏳ awaiting 10DLC for full US verification |
| M4 Stage 2 (Web Softphone) | Browser-to-Ethiopian-phone calls | One real US-to-US call once shipped | ⏳ pending build (~90 min) |
| M4 Stage 5 (DNC + warning flow) | Confirm modal + audit trail | One walkthrough with a "DNC-flagged" US prospect | After Stage 2 |
| Pre-launch | Code freeze, full regression | Full owner checklist + 10DLC active + real call test | Hard gate |

Each row makes it clear what the dev does daily, what the owner verifies periodically, and which milestone unblocks "production-ready" for that feature.

---

## TL;DR

- The geography gap doesn't block dev work — the code, DB, and webhook all work the same from anywhere
- Dev tests 95% of features with their Ethiopian phone + browser; covers structure, multi-tenant, real-time
- Owner runs a weekly 30-min checklist with their US phone; covers what only US carriers can verify
- 10DLC registration unblocks US-to-US SMS — needs to land before any real tenant goes live
- Real-time chat between dev and owner is hard (8-11h offset). Async-first: Loom videos, screenshots, shared Supabase Studio queries
- Don't pay for US virtual phones / SIMs until you actually hit a wall — the workflow above usually doesn't need them
