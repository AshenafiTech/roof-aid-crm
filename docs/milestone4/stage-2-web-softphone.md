# Stage 2 — Web WebRTC Softphone

**Goal:** Ship a fully-functional in-browser softphone for Telefonistas: click-to-call from any prospect surface, Mute/Hold/Transfer/Hangup, inbound-call banner with caller ID, recording, and a disposition modal that completes every call with an auditable record.

**Outcome:** A Telefonista does their entire day's outbound and inbound calling from inside the dashboard tab — never leaving the browser, never losing a call's context.

**Estimated time:** 2.5 days

---

## 1. Scope

| Feature | Where | Reads | Writes |
|---------|-------|-------|--------|
| Persistent softphone bar | Dashboard chrome (above main content, below nav) | WebRTC state | — |
| Click-to-call buttons | Prospect card, side panel, profile | `can_call()` | initiates call |
| Inbound call banner | Floating top-right when WebRTC sees `INVITE` | webhook routing | — |
| Disposition modal | Auto-opens on hangup | — | `call_logs`, `activities` |
| Call recording | Telnyx-side; we just store the URL | webhook payload | `call_logs.recording_url` |

---

## 2. Telnyx WebRTC integration

### 2.1 Credential generation

Telnyx WebRTC needs ephemeral credentials per session. **Do not** put SIP credentials in the browser. Instead:

```ts
// apps/web/app/api/telnyx/credentials/route.ts
export async function POST() {
  const user = await getCurrentUser();
  if (!user.telnyx_extension) return Response.json({error: 'no_extension'}, {status: 400});

  const r = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getVaultSecret('TELNYX_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_id: process.env.TELNYX_CONNECTION_ID,
      name: `agent-${user.id}-${Date.now()}`,
    }),
  });
  const cred = await r.json();
  // Telnyx returns a "token" usable by the WebRTC SDK; expires in ~10 min.
  return Response.json({ login_token: cred.data.login_token });
}
```

### 2.2 Softphone component

`apps/web/components/comms/softphone.tsx` — a client component mounted in the dashboard layout.

```tsx
'use client';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useEffect, useRef, useState } from 'react';
import { useCallStore } from '@/lib/stores/call-store';

export function Softphone() {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const [status, setStatus] = useState<'init'|'ready'|'in_call'|'error'>('init');
  const { current, setCurrent, setIncoming } = useCallStore();

  useEffect(() => {
    (async () => {
      const { login_token } = await fetch('/api/telnyx/credentials', {method:'POST'}).then(r=>r.json());
      const client = new TelnyxRTC({ login_token });
      client.on('telnyx.ready',     () => setStatus('ready'));
      client.on('telnyx.error',     () => setStatus('error'));
      client.on('telnyx.notification', (n) => {
        if (n.type === 'callUpdate') {
          if (n.call.state === 'ringing' && n.call.direction === 'inbound')
            setIncoming({ from: n.call.options.remoteCallerNumber, callId: n.call.id });
          if (n.call.state === 'active')   { setStatus('in_call'); setCurrent(n.call); }
          if (n.call.state === 'destroy')  { setStatus('ready'); setCurrent(null); /* trigger disposition modal */ }
        }
      });
      await client.connect();
      clientRef.current = client;
    })();
    return () => clientRef.current?.disconnect();
  }, []);

  // ...renders softphone bar with mic selector, level meter, status dot.
}
```

### 2.3 Click-to-call button

`apps/web/components/prospects/call-button.tsx`:

```tsx
'use client';
import { useCallStore } from '@/lib/stores/call-store';
import { canCall } from '@/lib/comms/can-call';

export function CallButton({ prospectId, phone }: { prospectId: string; phone: string }) {
  const [check, setCheck] = useState({ allowed: true, reason: 'ok' });
  const { client, dial } = useCallStore();
  useEffect(() => { canCall(prospectId).then(setCheck); }, [prospectId]);
  return (
    <Tooltip content={check.allowed ? 'Call' : tooltipFor(check.reason)}>
      <Button disabled={!check.allowed || !client} onClick={() => dial(phone, prospectId)}>
        <PhoneIcon /> Call
      </Button>
    </Tooltip>
  );
}
```

`dial(phone, prospectId)` calls `client.newCall({ destinationNumber: phone, callerNumber: process.env.NEXT_PUBLIC_TELNYX_DEFAULT_NUMBER, customHeaders: [{name: 'X-RoofAid-Prospect-Id', value: prospectId}, ...] })`.

The custom header `X-RoofAid-Prospect-Id` rides through to the Telnyx call-control webhooks so we can re-associate the call event with the prospect when it lands.

---

## 3. Disposition modal

When `telnyx.notification` reports `call.state === 'destroy'`, the softphone:

1. Captures `call.id` and `call.duration` into a Zustand store
2. Routes user (with a non-blocking modal) to choose a disposition
3. POSTs to `/api/calls/disposition`:

```ts
// apps/web/app/api/calls/disposition/route.ts
export async function POST(req: Request) {
  const { call_id, prospect_id, disposition, notes } = await req.json();
  const supa = await createServerClient();
  await supa.from('call_logs').upsert({
    provider_event_id: call_id,
    tenant_id: ...,
    prospect_id,
    disposition,
    notes,
    direction: 'outbound',
    started_at: ...,
    duration_seconds: ...,
  }, { onConflict: 'provider_event_id' });
  await supa.from('activities').insert({ ... });
  return Response.json({ ok: true });
}
```

Disposition options (constants — do **not** make these tenant-configurable in M4):
- `answered`
- `no_answer`
- `voicemail`
- `wrong_number`
- `dnc_request`  (also flips `prospects.do_not_call = true` server-side)
- `callback_requested`

---

## 4. Inbound call routing

### Telnyx webhook handler additions

`telnyx-webhook` now handles two event types:

```ts
switch (event.event_type) {
  case 'call.initiated': await handleInbound(event); break;
  case 'call.hangup':    await persistCallLog(event); break;
}
```

### `handleInbound(event)`

1. Identify tenant from `event.payload.to` (the Telnyx number that was dialed) — needs a `tenant_phone_numbers` table or a `tenants.telnyx_number TEXT UNIQUE` column
2. Find the agent currently online (`users.last_active_at > now() - 1m AND telnyx_extension IS NOT NULL`) — for v1, route to *any* online agent; M7 adds round-robin
3. Issue a `client.invite()` call-control command to that agent's WebRTC session
4. The agent's softphone fires `telnyx.notification → callUpdate(state: 'ringing', direction: 'inbound')` → renders the incoming-call banner

Banner UI: top-right floating card with:
- Caller's E.164 number (formatted)
- "Looking up prospect..." spinner that resolves to prospect name + city if a match is found
- Big green "Accept" button + grey "Reject" button
- Auto-dismiss after 30s

### `persistCallLog(event)`

Idempotently inserts into `call_logs`:

```ts
await admin.from('call_logs').upsert({
  provider_event_id: event.payload.call_session_id,
  tenant_id,
  prospect_id: lookupProspectIdByCallerNumber(event.payload.from),
  direction: event.payload.direction,
  started_at: event.payload.started_at,
  ended_at: event.payload.ended_at,
  duration_seconds: ...,
  recording_url: event.payload.recording_urls?.[0],
}, { onConflict: 'provider_event_id' });
```

---

## 5. Recording

Configured at the **Telnyx Outbound Voice Profile** level — record all calls, store at Telnyx for 30 days. On `call.hangup` event, Telnyx attaches `recording_urls`. We:

1. Fetch the MP3 from the Telnyx URL (one-time, signed)
2. Upload to `call-recordings/{tenant_id}/{call_id}.mp3` via the service role client
3. Save the Supabase Storage path on `call_logs.recording_url`

This runs as a deferred task (insert into `tasks` table; cron worker picks it up) — not inline in the webhook (Telnyx retries if we 5s timeout).

The recording-disclosure prompt is set per tenant via a Telnyx **Call Control Application** "Pre-Answer Audio" config. We update it via the Telnyx API when the tenant edits `recording_disclosure_audio_url` in settings (Stage M7).

---

## 6. UI surfaces touched

| File | Change |
|------|--------|
| `app/(dashboard)/layout.tsx` | Mount `<Softphone />` above `<main>` so it's visible on every dashboard page |
| `components/prospects/prospect-card.tsx` | Replace stub Call button with `<CallButton prospectId phone />` |
| `components/prospects/profile-action-bar.tsx` | Same |
| `components/prospects/side-panel-actions.tsx` | Same |
| `app/(dashboard)/prospects/[id]/calls/page.tsx` | Render `call_logs` rows newest-first; play button opens modal with `<audio src={recording_url} />` |

---

## 7. Acceptance checks

- [ ] Telefonista logs in → softphone status dot turns green within 5s
- [ ] Click Call on any prospect → demo phone rings → answer → can talk
- [ ] Mute / Hold / Hangup all do what the labels say
- [ ] Hangup → disposition modal opens, blocking → submit → `call_logs` has the row
- [ ] Inbound call to the tenant number → softphone shows incoming banner with caller number
- [ ] After Telnyx delivers the recording, the prospect's Calls tab shows a play button that streams the MP3 from Supabase Storage
- [ ] Replay the same Telnyx `call.hangup` webhook event 3× → exactly 1 row in `call_logs` (idempotency)
- [ ] Disabled-state cases work: prospect with no phone → Call button disabled with tooltip; DNC prospect → ditto; outside calling hours → ditto

---

## 8. Notes & gotchas

- **Browser permissions**: WebRTC requires the page to request microphone access. Show a one-time onboarding modal on first softphone init that explains why.
- **Single-tab limit**: Telnyx WebRTC sessions are per-credential. If a Telefonista opens two tabs, the second one's `client.connect()` boots the first. Solution: use BroadcastChannel to detect duplicate sessions and show a "softphone is active in another tab" banner.
- **Network drop mid-call**: `telnyx.error` fires with `state: 'destroy'`. Treat exactly like hangup. Disposition modal still opens with default `dropped` choice.
- **Custom header truncation**: Telnyx truncates SIP headers > 256 bytes. Keep `X-RoofAid-Prospect-Id` value to bare UUID (36 chars) — never include extra context.
- **Audio device hot-swap**: If the user plugs in a headset mid-call, `navigator.mediaDevices.ondevicechange` fires. Re-enumerate inputs and prompt to switch.
