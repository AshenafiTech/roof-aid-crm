import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { verifyTelnyxSignature } from '../_shared/telnyx-signature.ts'
import { logWebhookEvent, markWebhookProcessed } from '../_shared/log-webhook.ts'
import { handleInboundSms } from '../_shared/handle-inbound-sms.ts'
import { handleSmsStatusUpdate } from '../_shared/handle-sms-status.ts'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Telnyx webhook entry point.
 *
 * Verifies the Ed25519 signature, audit-logs every event into
 * `webhook_events`, and dispatches by event type. Currently handles:
 *   • message.received → handle-inbound-sms (with STOP auto-DNC)
 *   • message.sent / message.delivered / message.failed → handle-sms-status
 *
 * Stage 2 will add `call.initiated` / `call.hangup` dispatch for the
 * web softphone.
 *
 * Always 200s except on a forged signature (401). Telnyx retries on
 * any non-2xx — handler errors are logged into `webhook_events.process_error`
 * so we can replay from the raw payload, but they don't cause retries.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.text()
  const sig = req.headers.get('telnyx-signature-ed25519')
  const ts = req.headers.get('telnyx-timestamp')

  let parsed: { data?: { event_type?: string } } = {}
  try {
    parsed = JSON.parse(body)
  } catch {
    // fall through — we still log it
  }

  const ok = await verifyTelnyxSignature(body, sig, ts)
  const eventId = await logWebhookEvent({
    provider: 'telnyx',
    eventType: parsed.data?.event_type ?? 'unknown',
    payload: parsed,
    signatureOk: ok,
  })

  if (!ok) {
    return new Response('bad signature', { status: 401, headers: corsHeaders })
  }

  // Dispatch based on event type. Each handler is idempotent — Telnyx
  // retries on any non-2xx (and even on slow 2xx), so the same event
  // can land here more than once.
  const eventType = parsed.data?.event_type
  const eventPayload = (parsed.data as { payload?: unknown })?.payload ?? {}

  let handlerError: string | undefined
  try {
    switch (eventType) {
      case 'message.received':
        await handleInboundSms(eventPayload as Parameters<typeof handleInboundSms>[0])
        break
      case 'message.sent':
        await handleSmsStatusUpdate(
          eventPayload as Parameters<typeof handleSmsStatusUpdate>[0],
          'sent',
        )
        break
      case 'message.delivered':
        await handleSmsStatusUpdate(
          eventPayload as Parameters<typeof handleSmsStatusUpdate>[0],
          'delivered',
        )
        break
      case 'message.finalized': {
        // message.finalized is the *terminal* event for an outbound SMS.
        // Telnyx packs the actual outcome inside payload.to[0].status:
        //   - 'delivered'             → carrier confirmed delivery
        //   - 'delivery_unconfirmed'  → sent, carrier did not ACK (still arrived in most cases)
        //   - 'sending_failed' /
        //     'delivery_failed'       → never reached the recipient
        const finalStatus =
          (eventPayload as { to?: Array<{ status?: string }> })?.to?.[0]
            ?.status ?? 'delivery_unconfirmed'
        let next: 'delivered' | 'sent' | 'failed'
        if (finalStatus === 'delivered') next = 'delivered'
        else if (
          finalStatus === 'sending_failed' ||
          finalStatus === 'delivery_failed'
        )
          next = 'failed'
        else next = 'sent' // delivery_unconfirmed and any unknown sub-state
        await handleSmsStatusUpdate(
          eventPayload as Parameters<typeof handleSmsStatusUpdate>[0],
          next,
        )
        break
      }
      case 'message.failed':
        await handleSmsStatusUpdate(
          eventPayload as Parameters<typeof handleSmsStatusUpdate>[0],
          'failed',
        )
        break
      // Stage 2 will add: case 'call.initiated' / 'call.hangup'
      default:
        // Unknown event types are still logged in webhook_events for audit;
        // we just don't have a handler yet.
        break
    }
  } catch (e) {
    handlerError = e instanceof Error ? e.message : String(e)
    console.error(`telnyx-webhook handler failed for ${eventType}:`, e)
    // Still 200 — we've audited the event. Marking process_error lets us
    // replay later from webhook_events.payload if needed.
  }

  await markWebhookProcessed(eventId, handlerError)
  return new Response('ok', { status: 200, headers: corsHeaders })
})
