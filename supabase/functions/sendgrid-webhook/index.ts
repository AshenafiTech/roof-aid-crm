import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { verifySendgridSignature } from '../_shared/sendgrid-signature.ts'
import { logWebhookEvent, markWebhookProcessed } from '../_shared/log-webhook.ts'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * SendGrid webhook entry point.
 *
 * SendGrid uses the same URL for two flows:
 *   1. Event webhook (delivery / open / click / bounce / spam) —
 *      JSON array of events, signed.
 *   2. Inbound Parse (replied emails) — multipart/form-data.
 *
 * Stage 1 (this file) ONLY:
 *   • detects which flow this is
 *   • verifies signatures (event webhook only — inbound parse is
 *     authenticated via DNS routing)
 *   • logs every event
 *   • returns 200 quickly
 *
 * Stage 4 fills in the dispatch — `delivered` / `bounce` / `spamreport`
 * status updates and inbound-email parsing into `email_logs`.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const ct = req.headers.get('content-type') ?? ''
  const isInbound = ct.startsWith('multipart/form-data')

  if (isInbound) {
    // Stage 4: parse multipart, look up the parent email_logs row by
    // In-Reply-To, insert as direction='inbound'. For Stage 1 we just
    // log and 200.
    await logWebhookEvent({
      provider: 'sendgrid',
      eventType: 'inbound.email',
      payload: { contentType: ct },
      signatureOk: true, // inbound parse isn't cryptographically signed
    })
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  // Event webhook path
  const body = await req.text()
  const sig = req.headers.get('x-twilio-email-event-webhook-signature')
  const ts = req.headers.get('x-twilio-email-event-webhook-timestamp')

  const ok = await verifySendgridSignature(body, sig, ts)

  let parsed: unknown[] = []
  try {
    parsed = JSON.parse(body)
  } catch {
    // log raw body below
  }

  // SendGrid sends events in an array. Log each individually so audit
  // queries can filter by event_type without unwrapping the array.
  const eventIds: (string | null)[] = []
  for (const ev of Array.isArray(parsed) ? parsed : [parsed]) {
    const eventType = (ev as { event?: string })?.event ?? 'unknown'
    eventIds.push(
      await logWebhookEvent({
        provider: 'sendgrid',
        eventType,
        payload: ev,
        signatureOk: ok,
      }),
    )
  }

  if (!ok) {
    return new Response('bad signature', { status: 401, headers: corsHeaders })
  }

  // Stage-4 dispatcher will plug in here per event:
  //   delivered / bounce / spamreport / unsubscribe / open / click

  for (const id of eventIds) await markWebhookProcessed(id)
  return new Response('ok', { status: 200, headers: corsHeaders })
})
