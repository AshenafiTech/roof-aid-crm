# Stage 4 — Web Email Module

**Goal:** Send transactional + ad-hoc email through SendGrid, log every send to `email_logs`, ingest delivery + bounce + spam events via the SendGrid Event Webhook, and parse inbound replies via SendGrid Inbound Parse.

**Outcome:** Telefonistas can compose and send personal emails to prospects with templates; every email has an auditable status trail; bounces don't blacklist the tenant's domain.

**Estimated time:** 1.5 days

---

## 1. Scope

| Feature | Surface | Notes |
|---------|---------|-------|
| Compose modal | Prospect side panel + Email tab | To pre-filled, Subject, Body (markdown for v1) |
| Send via SendGrid | API route → task → SendGrid API | Async pattern, mirrors SMS |
| Templates | `tenants.email_templates` | Same JSONB shape as SMS templates |
| Status updates | SendGrid event webhook | `delivered` / `bounced` / `spam_reported` / `unsubscribed` |
| Inbound parse | SendGrid Inbound Parse webhook | Threaded by `In-Reply-To` header |
| Email tab | Per-prospect | Newest first, expandable to show full body |

---

## 2. Schema

`email_logs` already exists. Confirm/extend:

```sql
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT UNIQUE,   -- RFC822 Message-ID header
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT;

-- provider_message_id was added in Stage 1.

CREATE INDEX IF NOT EXISTS email_logs_thread_idx
  ON email_logs (prospect_id, created_at DESC);
```

---

## 3. `send_email` RPC

```sql
CREATE OR REPLACE FUNCTION send_email(
  p_prospect_id UUID,
  p_subject TEXT,
  p_body_html TEXT,
  p_body_text TEXT,
  p_in_reply_to TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT; v_log_id UUID; v_tenant_id UUID;
BEGIN
  SELECT tenant_id, email INTO v_tenant_id, v_email
  FROM prospects WHERE id = p_prospect_id;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'no_email';
  END IF;
  -- DNC does NOT block email per TCPA — but tenants can opt to honor it.
  -- Add a `tenants.dnc_blocks_email` flag in M7; v1 lets email through.

  INSERT INTO email_logs (
    tenant_id, prospect_id, direction, subject,
    body_html, body_text, in_reply_to, agent_id,
    delivery_status
  )
  VALUES (
    v_tenant_id, p_prospect_id, 'outbound', p_subject,
    p_body_html, p_body_text, p_in_reply_to, auth.uid(),
    'queued'
  )
  RETURNING id INTO v_log_id;

  INSERT INTO tasks (kind, payload)
  VALUES ('sendgrid.send_email', jsonb_build_object('email_log_id', v_log_id));

  RETURN v_log_id;
END;
$$;
```

---

## 4. Task worker — outbound email

Add to `process-tasks/index.ts`:

```ts
case 'sendgrid.send_email': {
  const log = await admin.from('email_logs').select('*, prospects(name, email), users(email, first_name, last_name)')
    .eq('id', t.payload.email_log_id).single();

  const message_id = `<${crypto.randomUUID()}@${process.env.SENDGRID_FROM_DOMAIN}>`;

  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getVaultSecret('SENDGRID_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: log.prospects.email, name: log.prospects.name }] }],
      from: { email: `${log.users.first_name}@${process.env.SENDGRID_FROM_DOMAIN}`, name: `${log.users.first_name} ${log.users.last_name}` },
      subject: log.subject,
      content: [
        { type: 'text/plain', value: log.body_text },
        { type: 'text/html',  value: log.body_html },
      ],
      headers: {
        'Message-ID': message_id,
        ...(log.in_reply_to && { 'In-Reply-To': log.in_reply_to, References: log.in_reply_to }),
      },
      // SendGrid uses categories for event-webhook filtering
      categories: [`tenant:${log.tenant_id}`, `prospect:${log.prospect_id}`],
      // Custom args ride through on every event for that message
      custom_args: { email_log_id: log.id },
    }),
  });

  await admin.from('email_logs').update({
    delivery_status: r.ok ? 'sent' : 'failed',
    message_id,
    provider_message_id: r.headers.get('x-message-id'),
  }).eq('id', log.id);
}
```

---

## 5. Event webhook handler

`sendgrid-webhook` switches on the event array (SendGrid sends events as a batched JSON array):

```ts
const events = await req.json() as SendGridEvent[];
for (const ev of events) {
  const log_id = ev.email_log_id;  // from custom_args
  if (!log_id) continue;
  switch (ev.event) {
    case 'delivered':       await mark(log_id, 'delivered'); break;
    case 'bounce':          await mark(log_id, 'bounced', ev.reason); break;
    case 'spamreport':      await mark(log_id, 'spam_reported'); break;
    case 'unsubscribe':     await mark(log_id, 'unsubscribed'); break;
    case 'open':            await markOpened(log_id, ev.timestamp); break;
    case 'click':           await markClicked(log_id, ev.timestamp, ev.url); break;
  }
}
```

`mark` is a generic helper:

```ts
async function mark(log_id: string, status: string, bounce_reason?: string) {
  await admin.from('email_logs').update({
    delivery_status: status,
    ...(bounce_reason && { bounce_reason }),
  }).eq('id', log_id);
}
```

For `bounce` events, **also**:
- Mark `prospects.email = null` if the bounce is a hard bounce (`type === 'bounce'` not `'blocked'`) — no point trying again
- Insert a notification for the agent who sent

---

## 6. Inbound parse

SendGrid Inbound Parse posts to our `sendgrid-webhook` as `multipart/form-data`. Detect by Content-Type and route:

```ts
if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
  return handleInboundEmail(req);
}
```

`handleInboundEmail` parses the multipart, extracts:
- `from`, `to`, `subject`, `text`, `html`, `headers`
- The `In-Reply-To` header → look up the parent `email_logs` row by `message_id`
- Match prospect by from-address; if no match, log with `prospect_id = null`

```ts
const referenced = await admin.from('email_logs')
  .select('prospect_id, tenant_id')
  .eq('message_id', headers['In-Reply-To']).maybeSingle();

await admin.from('email_logs').upsert({
  message_id: headers['Message-ID'],
  tenant_id: referenced?.tenant_id ?? guessByDomain(to),
  prospect_id: referenced?.prospect_id,
  direction: 'inbound',
  subject, body_text: text, body_html: html,
  delivery_status: 'received',
  in_reply_to: headers['In-Reply-To'],
}, { onConflict: 'message_id' });
```

Then notify the agent who sent the parent email.

---

## 7. UI

### Compose modal

`components/comms/email-composer.tsx`:
- To: read-only, shows `prospect.email`, error state if missing
- From: read-only, shows agent's `${first_name}@${SENDGRID_FROM_DOMAIN}`
- Subject: text input
- Body: markdown editor (use `@uiw/react-md-editor` — already in the React ecosystem we have)
- "Templates ▾" — selecting fills Subject + Body
- "Send" — calls `supabase.rpc('send_email', {...})`, shows toast `Queued — delivery confirmation will appear in the Email tab`

### Email tab

`app/(dashboard)/prospects/[id]/email/page.tsx`:
- List of email_logs newest-first
- Each row: subject, status badge (queued / sent / delivered / bounced / spam_reported), timestamp
- Click row → expands inline to show body
- Reply button on inbound rows → opens compose modal pre-filled with `Re: <subject>`, `In-Reply-To: <message_id>`

---

## 8. Acceptance checks

- [ ] From a prospect with `email`, click Email → compose with template → send → row appears as `queued`
- [ ] Within ~30 seconds the row flips to `delivered`
- [ ] Hard-bounced address: the row shows `bounced` with reason; the prospect's email field is cleared
- [ ] Click "Reply" on an inbound email → compose modal opens with `Re:` prefix and `In-Reply-To` set → send → reply threads correctly to the original
- [ ] Same SendGrid event fired twice → no duplicate status updates (idempotency on `email_logs.id` + status)
- [ ] Spam complaint event flips status to `spam_reported` and notifies admin
- [ ] Inbound email from unknown sender lands with `prospect_id = null` and shows up in M7's "unmatched messages" queue

---

## 9. Notes & gotchas

- **Domain authentication is non-negotiable**: SPF + DKIM + DMARC must all be passing. Without them, deliverability collapses to ~30%. Check via `dig TXT mail.roofaid.app +short`.
- **Per-agent personalization**: send-from `jordan@mail.roofaid.app` not `noreply@`. Customers reply, agents see replies, conversations work. SendGrid subusers add a per-tenant routing layer in M7.
- **List-Unsubscribe header**: SendGrid auto-injects this when "Subscription Tracking" is on. Required for bulk-rate Gmail/Yahoo.
- **Bounce types**: hard bounce = invalid address (don't retry, clear the email field). Soft bounce = mailbox full / temp issue (do nothing; SendGrid retries internally).
- **Event ordering**: SendGrid events arrive batched but not strictly ordered (`delivered` and `open` can arrive in either order). Use timestamps from the event, not `now()`.
- **Markdown rendering**: render to HTML server-side using `marked` + DOMPurify before sending. Never let user-typed HTML through directly.
