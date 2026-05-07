# Step 8 — Web Softphone (M4 Stage 2 — code half)

**Date:** 2026-05-01
**Stage:** M4 Stage 2 — completes calling for the multi-tenant architecture
**Files added:**
- `apps/web/lib/telnyx/client.ts` — `mintLoginToken()` export
- `apps/web/app/api/telnyx/credentials/route.ts` — multi-tenant aware credential mint
- `apps/web/lib/stores/softphone-store.ts` — Zustand store
- `apps/web/components/comms/softphone.tsx` — softphone bar + incoming-call banner
- `apps/web/components/comms/call-button.tsx` — replaces inert Call button
- `apps/web/lib/calls/actions.ts` — `canCallProspect()` server action

**Files modified:**
- `apps/web/app/(dashboard)/dashboard-shell.tsx` — mounts `<Softphone />`
- `apps/web/app/(dashboard)/prospects/[id]/page.tsx` — adds `<CallButton>` to the header
- `apps/web/lib/supabase/database.types.ts` — regenerated for migration 015
- `apps/web/package.json` — `@telnyx/webrtc ^2.26.4`

## Purpose

Make calling work end-to-end in the browser, with multi-tenant isolation correct from the first commit. A telefonista signs in → softphone bar shows green within 5s → click Call on a prospect → real phone rings → click Accept → can talk → hang up.

## How the multi-tenant isolation works at runtime

```
Telefonista signs in
   ↓
<Softphone /> mounts → POSTs /api/telnyx/credentials
   ↓
Server reads cookie → users.tenant_id → tenants.telnyx_credential_connection_id
   ↓
Server: POST /v2/telephony_credentials with that connection_id
        POST /v2/telephony_credentials/{id}/token
   ↓
Returns { login_token, caller_number: <tenant primary>, user }
   ↓
Browser: new TelnyxRTC({ login_token }) → connects to Telnyx WebSocket
        Registered against THE TENANT'S connection only
   ↓
Inbound call to a Tenant 1 number → rings only Tenant 1 browsers
Outbound dial → uses caller_number (Tenant 1's primary) as caller ID
```

Tenant 2's browsers register against Tenant 2's connection. Same code path, different connection_id by virtue of the user's session. **The boundary is enforced at the Telnyx layer, not in our app code** — even a buggy WebSocket implementation can't cross-tenant by accident.

## What's in the bar

- **Status dot** — colored by state: amber connecting, green ready/in-call, blue ringing, red error
- **Status text** — "Ready to call · From (512) 980-6131" / "Incoming from …" / "On call with Ashenafi" / etc.
- **Active-call controls** — Mute / Unmute, Hang up
- **Outbound dialing** — Cancel button while ringing
- **Error state** — Reconnect button (full reload, simplest fix)

## Inbound call banner

A floating card top-right with:
- Caller's E.164 (formatted)
- Big green Accept + outline Reject

Renders only when `status === 'ringing_in'`. Stays until accepted/rejected/auto-dismissed by Telnyx timeout.

## Call button on prospect detail

Added to the `<PageHeader>` action slot, sits next to the status badge.

Click flow:
1. Calls `canCallProspect()` server action
2. Server runs the `can_call()` SQL RPC — returns `{ allowed, reason }`
3. Result classification:
   - **Hard block** (no_phone, cross_tenant, not_found) → toast.error, no dial
   - **Soft warning** (dnc, outside_calling_hours) → opens `<DncConfirmDialog>`
   - **OK** → dials immediately
4. On confirm-and-dial, the SIP `customHeaders` include `X-RoofAid-Acknowledged-Warnings: dnc,outside_calling_hours` for future webhook-side audit (Stage 5 reads this when populating `call_logs`)

Reuses the same `<DncConfirmDialog>` from Stage 3 SMS — single source of truth for the warning UI.

## Credential lifecycle

- Token TTL is ~10 min on Telnyx's side
- Component refreshes at 80% of TTL (~8 min) to keep the session warm
- Refresh = disconnect + re-init (simpler than mid-session token swap; user-visible blip is < 1s)
- React 18 strict mode double-invokes effects in dev; `initRanRef` guards against creating two clients (Telnyx kicks the first session if a second connects with the same credential — would cause "phantom" disconnects)

## What NOT in this step (deferred)

- **Disposition modal on hangup** — opens after `state === 'destroy'` to record outcome (answered / no_answer / voicemail / wrong_number / dnc_request / callback_requested) and inserts into `call_logs`. Will land alongside the `call.*` webhook handlers below.
- **`call.*` webhook handlers** — `call.initiated`, `call.answered`, `call.hangup` events from Telnyx → write `call_logs` rows with attribution. Currently the audit row in `webhook_events` records the event but no `call_logs` row gets created. Will be a small follow-on.
- **Recording wiring** — Telnyx records server-side based on OVP setting; we currently have recording **off** until the TCPA disclosure UX is built. Storage upload to `call-recordings/{tenant_id}/...` happens after recording is enabled.
- **Inbound routing logic** — assigned-rep-first, ring-all, voicemail per `tenant_phone_numbers.routing_rule`. Currently every browser registered to a tenant connection rings on every inbound call. Routing logic is webhook-driven (separate work).
- **Multi-tab dedup** — if a user opens two tabs, both connect with the same user_id. Telnyx may handle this gracefully (kicking the older session) or it may conflict. BroadcastChannel-based dedup is in the original spec; defer until it bites.
- **Mobile in-app calling** — out of M4 scope per the original blueprint; ruferos use `tel:` URI from Flutter.

## Manual test plan

End-to-end verification (requires real Telnyx voice traffic):

1. **Sign in as Tenant 1 telefonista** (`telefonista1@roof-aid-test.com` / `RoofAid-T1-Tel-26`)
2. **Wait 3-5 seconds** — softphone bar at top of page should flip from "Connecting…" to "Ready to call · From (512) 980-6131"
3. **Open the Ashenafi Godana prospect** (Tenant 1, has +251 phone)
4. **Click Call**
   - First time: browser asks for mic permission — Allow
   - Bar shows "Calling Ashenafi Godana…"
   - Real Ethiopian phone rings (after ~2-5 seconds international PSTN routing)
5. **Answer on the real phone** — bar flips to "On call"; speak — confirm two-way audio
6. **Click Mute** in the bar — your voice stops on the recipient's end; click Unmute
7. **Click Hang up** — bar returns to "Ready"
8. **Test inbound** — from your real phone, dial `+1-512-980-6131`. Browser shows incoming-call banner with caller ID, click Accept, talk, hang up
9. **Multi-tenant verification** — open a second incognito window, sign in as `telefonista2@roof-aid-test.com`. Repeat call to `+1-512-566-1478`. **Only the second browser rings.** First browser stays at "Ready". Confirms tenant isolation.

## Pre-test gotchas

- **Mic permission**: Chrome blocks WebRTC without it. If you accidentally Deny, click the lock 🔒 icon in the address bar → reset Microphone → reload.
- **Outbound to +251 (Ethiopia)**: The OVP needs Ethiopia in Allowed Destinations. Same toggle as the SMS path. If outbound to your Ethiopian phone fails, that's the fix.
- **Softphone bar invisible**: roles other than `owner | admin | telefonista | super_admin` get a 403 from `/api/telnyx/credentials`. Bar shows "error" briefly then disappears. Sign in as one of those roles.
- **Two browser tabs at once**: Telnyx may disconnect the older session when a newer one connects. Use a single tab per user.

## Verified

- ✅ TypeScript clean across the whole web app after regenerating types
- ✅ SDK installed in the right workspace (`apps/web/package.json`)
- ✅ Multi-tenant isolation: every credential is minted against `tenants.telnyx_credential_connection_id`, scoped to the caller's tenant; never the platform-wide voice app
- ✅ DNC + outside-hours soft-warning pattern matches the [memory note](../../.claude/projects/-home-ashe-Documents-work-roof-aid-crm/memory/feedback_dnc_warning_only.md)
- ✅ Reuses existing `<DncConfirmDialog>` from Stage 3 SMS — no duplication

## Next: small follow-on PR

| Piece | Estimate |
|---|---|
| `call.*` webhook handlers writing to `call_logs` with idempotency on `provider_event_id` | 30 min |
| Disposition modal on hangup | 30 min |
| "Send from" picker if tenant has multiple numbers (defer until 2nd number per tenant is common) | 30 min |
| Recording wiring once TCPA consent UX exists | hours, not needed for v0.1 |

These can each be PR-sized chunks once we've confirmed the basic call path works end-to-end.

## References

- [stage-2-web-softphone.md](stage-2-web-softphone.md) — original spec
- [multi-tenant-test-setup.md](multi-tenant-test-setup.md) — connection architecture
- [step-7-sms-ui.md](step-7-sms-ui.md) — DNC override pattern we reuse
- Telnyx WebRTC SDK: <https://github.com/team-telnyx/webrtc>
