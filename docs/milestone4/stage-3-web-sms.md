# Stage 3 — Web SMS Module

**Goal:** Two-way SMS conversations per prospect — send, receive, render as a thread, with templates, segment counter, delivery status, and TCPA-compliant STOP-keyword handling.

**Outcome:** A Telefonista can text a prospect, see the homeowner's reply land in real time, and have the system auto-DNC any number that texts STOP — without any manual intervention.

**Estimated time:** 1.5 days

---

## 1. Scope

| Feature | Surface | Notes |
|---------|---------|-------|
| Side-panel SMS thread | Prospect side panel + dedicated SMS tab | Threaded by `prospect_id`; newest at bottom |
| Compose with template insert | Side panel | Pulls from `tenants.sms_templates` |
| Segment counter | Compose | 160-char GSM-7, 70-char Unicode, segment ceiling at 6 |
| Send | RPC `send_sms` → Edge Function | Idempotent via client-generated UUID |
| Receive | Telnyx webhook → `sms_logs` | Realtime channel pushes to UI |
| Delivery status | Webhook `message.sent` / `delivered` / `failed` | Updates `sms_logs.delivery_status` |
| STOP auto-DNC | Webhook | Auto-reply + DNC flag in same transaction |

---

## 2. Schema

`sms_logs` already exists from M1. Stage 1 added `provider_message_id UNIQUE`. Confirm the columns we need:

```sql
-- Verify in psql; add if missing.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sms_logs';

-- Expected:
-- id, tenant_id, prospect_id, direction, body, sent_at, segments,
-- delivery_status, provider_message_id, from_number, to_number, agent_id
```

If any are missing add a migration `013_sms_log_columns.sql` and backfill from existing rows.

---

## 3. `send_sms` RPC

`supabase/migrations/014_send_sms_rpc.sql`:

```sql
CREATE OR REPLACE FUNCTION send_sms(
  p_prospect_id UUID,
  p_body TEXT,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check JSONB;
  v_log_id UUID;
  v_phone TEXT;
BEGIN
  v_check := can_message(p_prospect_id);
  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'sms_not_allowed: %', v_check->>'reason';
  END IF;

  SELECT phones[1] INTO v_phone FROM prospects WHERE id = p_prospect_id;

  -- Idempotency: if a row already exists with this key, return its id.
  SELECT id INTO v_log_id
  FROM sms_logs WHERE provider_message_id = p_idempotency_key::text;
  IF v_log_id IS NOT NULL THEN RETURN v_log_id; END IF;

  INSERT INTO sms_logs (
    tenant_id, prospect_id, direction, body,
    delivery_status, agent_id, to_number,
    provider_message_id  -- temporary: replaced by Telnyx id when send completes
  )
  VALUES (
    current_setting('app.tenant_id')::uuid, p_prospect_id, 'outbound', p_body,
    'queued', auth.uid(), v_phone,
    p_idempotency_key::text
  )
  RETURNING id INTO v_log_id;

  -- Asynchronously enqueue the actual Telnyx call.
  INSERT INTO tasks (kind, payload)
  VALUES ('telnyx.send_sms', jsonb_build_object('sms_log_id', v_log_id));

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_sms TO authenticated;
```

The reason we don't call Telnyx synchronously inside the RPC: if the Telnyx API is slow, the user-facing send button hangs. The pattern is **insert-then-enqueue** — the row appears immediately as `queued`, the task worker fires the actual Telnyx call, the webhook updates the row to `sent`/`delivered`. The UI subscribes to `sms_logs` Realtime channel, so the user sees state changes happen.

---

## 4. Task worker for outbound

Two options for the worker:

**A. Supabase scheduled Edge Function** that polls `tasks` every 5 seconds (simple, but eats invocations).

**B. Postgres `LISTEN/NOTIFY` consumer** in a tiny Deno service deployed on Vercel as a long-running route handler with an HTTP keepalive (less common, more efficient).

For M4 ship A. The scheduled function runs every 5s, claims any `tasks` rows where `kind = 'telnyx.send_sms' AND processed_at IS NULL`, calls Telnyx Messaging API, updates the row.

```ts
// supabase/functions/process-tasks/index.ts (cron: */5 * * * * *)
const { data: tasks } = await admin
  .from('tasks').select()
  .is('processed_at', null)
  .eq('kind', 'telnyx.send_sms')
  .limit(20);
for (const t of tasks ?? []) {
  const sms = await admin.from('sms_logs').select().eq('id', t.payload.sms_log_id).single();
  const r = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getVaultSecret('TELNYX_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.TELNYX_DEFAULT_NUMBER,
      to: sms.to_number,
      text: sms.body,
    }),
  });
  const j = await r.json();
  await admin.from('sms_logs').update({
    delivery_status: 'sent',
    provider_message_id: j.data.id,
  }).eq('id', sms.id);
  await admin.from('tasks').update({ processed_at: new Date().toISOString() }).eq('id', t.id);
}
```

---

## 5. Inbound SMS handler

Inside `telnyx-webhook` switch statement, add:

```ts
case 'message.received': await handleInboundSms(event); break;
case 'message.sent':     await markSmsStatus(event, 'sent'); break;
case 'message.delivered':await markSmsStatus(event, 'delivered'); break;
case 'message.failed':   await markSmsStatus(event, 'failed'); break;
```

`handleInboundSms`:

```ts
async function handleInboundSms(event: TelnyxEvent) {
  const from = event.payload.from.phone_number;
  const body = event.payload.text;
  const tenantId = await tenantFromInboundNumber(event.payload.to[0].phone_number);
  const prospect = await findProspectByPhone(tenantId, from);

  // STOP keyword test happens FIRST, in same transaction as DNC flag and reply.
  if (/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(body)) {
    await admin.rpc('apply_sms_stop', {
      p_tenant_id: tenantId,
      p_prospect_id: prospect?.id,
      p_phone: from,
      p_message_body: body,
    });
    // The RPC also enqueues the auto-reply task.
    return;
  }

  await admin.from('sms_logs').upsert({
    provider_message_id: event.payload.id,
    tenant_id: tenantId,
    prospect_id: prospect?.id,
    direction: 'inbound',
    body,
    delivery_status: 'received',
    from_number: from,
    to_number: event.payload.to[0].phone_number,
    sent_at: event.payload.received_at,
  }, { onConflict: 'provider_message_id' });

  await admin.from('notifications').insert({
    tenant_id: tenantId,
    user_id: prospect?.assigned_to ?? null,
    kind: 'sms_received',
    payload: { prospect_id: prospect?.id, body },
  });
}
```

`apply_sms_stop` RPC handles atomically: insert inbound row, set `prospects.do_not_call = true`, insert `dnc_records`, enqueue auto-reply ("You've been unsubscribed. Reply START to opt back in.").

---

## 6. UI

### `components/comms/sms-thread.tsx`

Renders the conversation. Subscribes to a Realtime channel filtered by prospect:

```tsx
const channel = supabase
  .channel(`sms:${prospectId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'sms_logs', filter: `prospect_id=eq.${prospectId}` },
    () => refetch()
  ).subscribe();
```

Bubble layout: outbound right-aligned (primary tint), inbound left-aligned (surface tint), timestamp + delivery status icon under each bubble (✓ sent, ✓✓ delivered, ⚠ failed, ⏱ queued).

### `components/comms/sms-composer.tsx`

```tsx
function segmentsFor(text: string) {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / cap));
}
```

Layout:
- Textarea (auto-grows up to 5 lines)
- Below textarea: `[42 / 160 chars · 1 segment]` counter, color goes amber at 5 segments, red at 6
- "Templates ▾" dropdown to the left of the send button — clicking inserts text and focuses cursor at end
- Send button calls `supabase.rpc('send_sms', {...})` and clears the textarea on success

### Side panel + tab

`prospect/[id]/sms` route renders the same `<SmsThread>` full-screen. Side panel is the same component in a `<Sheet>` for quick reply.

---

## 7. Realtime in dev

Enable Realtime on `sms_logs` once during initial Supabase project setup:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs;
```

If this is already on for `prospects` from M2, mirror the call. Run via Supabase dashboard → Database → Replication.

---

## 8. Acceptance checks

- [ ] Open prospect → click SMS → side panel shows existing thread (if any)
- [ ] Type a message → send → bubble appears immediately as `queued` → flips to `sent` then `delivered` within ~10 seconds (visible to the user via Realtime)
- [ ] From the QA homeowner phone, reply → message lands in the thread within ~2 seconds without the user touching anything
- [ ] Reply "STOP" → within 30s the prospect is DNC, the prospect's row in the list shows the DNC badge, and a "You've been unsubscribed" auto-reply was sent
- [ ] Send button is disabled with tooltip when `can_message()` returns `{allowed:false, reason:'dnc'}` (or `no_phone`)
- [ ] Send same `idempotency_key` twice → only one row in `sms_logs`, only one Telnyx send happens
- [ ] Segment counter goes amber at 5 segments, red at 6
- [ ] Templates dropdown loads from `tenants.sms_templates`

---

## 9. Notes & gotchas

- **Outbound number consistency**: the same Telnyx number must be used for inbound and outbound for a given prospect, or the homeowner sees replies coming from a different number than the one that texted them. v1: one tenant = one Telnyx number. M7 adds per-agent numbers.
- **Multi-segment UTF-16 truncation**: emojis split badly. The segment counter MUST count UTF-16 code units, not `string.length` of grapheme clusters. Use `[...text].length` carefully.
- **STOP regex permissiveness**: include common spelling variants. Telnyx and the carriers will eventually intercept these themselves, but our app-level handling is the belt and suspenders.
- **Inbound number not in DB**: an SMS from an unknown number still gets logged, just with `prospect_id = null`. M7's "unmatched messages" queue lets admins triage these.
- **Template variable substitution** (e.g. `{{prospect.name}}`): defer to M7. v1 templates are plain strings.
