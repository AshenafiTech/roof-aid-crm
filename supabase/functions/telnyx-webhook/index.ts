// Telnyx webhook — Stage 1 skeleton.
//
// One endpoint for every Telnyx event (call.* and message.*).
// This skeleton:
//   1. Reads the raw body + signature headers
//   2. Verifies the Ed25519 signature against TELNYX_PUBLIC_KEY
//   3. Logs the event to webhook_events (audit trail; survives handler bugs)
//   4. Returns 200 fast (Telnyx retries any non-2xx)
//
// Real handlers (call lifecycle in Stage 2, SMS in Stage 3) plug into
// the dispatcher block below. Don't add slow work here — anything > 5s
// belongs on a tasks queue.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { admin } from '../_shared/supabase-admin.ts'
import { verifyTelnyxSignature } from '../_shared/telnyx-signature.ts'
import {
  handleInboundSms,
  handleOutboundSmsStatus,
} from '../_shared/sms-handlers.ts'
import {
  handleCallInitiated,
  handleCallAnswered,
  handleCallHangup,
  handleCallRecordingSaved,
} from '../_shared/call-handlers.ts'

const TELNYX_PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY') ?? null

interface TelnyxEnvelope {
  data?: {
    event_type?: string
    id?: string
    payload?: Record<string, unknown>
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('telnyx-signature-ed25519')
  const timestamp = req.headers.get('telnyx-timestamp')

  // 1. Verify signature
  const verdict = await verifyTelnyxSignature(
    rawBody,
    signature,
    timestamp,
    TELNYX_PUBLIC_KEY,
  )

  // 2. Parse JSON best-effort. A malformed body still gets logged so we
  //    can diagnose later, but downstream dispatch is skipped.
  let parsed: TelnyxEnvelope | null = null
  try {
    parsed = JSON.parse(rawBody) as TelnyxEnvelope
  } catch {
    parsed = null
  }
  const eventType = parsed?.data?.event_type ?? 'unknown'
  const providerEventId = parsed?.data?.id ?? null

  // 3. Audit log — every event, signed or not, lands here
  const { error: auditErr } = await admin.from('webhook_events').insert({
    provider: 'telnyx',
    event_type: eventType,
    payload: parsed ?? { _raw: rawBody.slice(0, 4000) },
    signature_ok: verdict.ok,
    process_error: verdict.ok ? null : (verdict.reason ?? 'unknown'),
  })
  if (auditErr) {
    // If we can't even log, return 500 so Telnyx retries — better to
    // double-process than to silently lose an event.
    console.error('webhook_events insert failed', auditErr)
    return new Response('audit insert failed', { status: 500 })
  }

  // 4. Reject forged signatures with 401 AFTER auditing (so the audit
  //    row exists even for rejected attempts — useful for forensics)
  if (!verdict.ok) {
    return new Response(
      JSON.stringify({ ok: false, reason: verdict.reason }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  // 5. Dispatcher — message.* (Stage 3); call.* lands in Stage 2.
  //    Idempotency on provider_message_id is enforced inside the
  //    per-event handler via INSERT ... ON CONFLICT DO NOTHING.
  let processError: string | null = null
  try {
    switch (eventType) {
      case 'message.received':
        await handleInboundSms(parsed?.data?.payload as Parameters<typeof handleInboundSms>[0])
        break
      case 'message.sent':
        await handleOutboundSmsStatus(
          parsed?.data?.payload as Parameters<typeof handleOutboundSmsStatus>[0],
          'sent',
        )
        break
      case 'message.finalized': {
        // Telnyx v2 message.finalized carries the terminal state inside
        // payload.to[].status. Known values:
        //   delivered             — carrier confirmed
        //   delivery_unconfirmed  — sent but no delivery receipt (toll-free,
        //                            certain international destinations);
        //                            treat as its own status, not 'sent'
        //   failed / delivery_failed / sending_failed — terminal failure
        const payload = parsed?.data?.payload as {
          to?: Array<{ status?: string }>
        } | undefined
        const status = payload?.to?.[0]?.status
        const final: 'delivered' | 'delivery_unconfirmed' | 'failed' | null =
          status === 'delivered' ? 'delivered'
          : status === 'delivery_unconfirmed' ? 'delivery_unconfirmed'
          : (status === 'failed' || status === 'delivery_failed' || status === 'sending_failed') ? 'failed'
          : null
        if (final) {
          await handleOutboundSmsStatus(
            parsed?.data?.payload as Parameters<typeof handleOutboundSmsStatus>[0],
            final,
          )
        } else {
          processError = `unhandled_finalized_status:${status ?? 'unknown'}`
        }
        break
      }

      // Call lifecycle — see _shared/call-handlers.ts. Each handler
      // upserts call_logs keyed on telnyx_call_id, so replays and
      // out-of-order events are idempotent.
      case 'call.initiated':
        await handleCallInitiated(parsed?.data?.payload as Parameters<typeof handleCallInitiated>[0])
        break
      case 'call.answered':
        await handleCallAnswered(parsed?.data?.payload as Parameters<typeof handleCallAnswered>[0])
        break
      case 'call.hangup':
        await handleCallHangup(parsed?.data?.payload as Parameters<typeof handleCallHangup>[0])
        break
      case 'call.recording.saved':
        await handleCallRecordingSaved(parsed?.data?.payload as Parameters<typeof handleCallRecordingSaved>[0])
        break

      default:
        if (eventType.startsWith('call.')) {
          // Other call.* events (bridged, dtmf.received, machine.detection.ended,
          // playback.started, etc.) — we audit but don't act. Re-enable per
          // event as features need them.
          processError = `call_event_not_handled:${eventType}`
        } else {
          processError = 'unhandled_event_type'
        }
    }
  } catch (err) {
    processError = `handler_threw:${(err as Error)?.message ?? 'unknown'}`
    console.error(`[telnyx-webhook] handler error for ${eventType}`, err)
  }

  // Annotate the audit row with processed_at + any error reason
  if (providerEventId) {
    await admin
      .from('webhook_events')
      .update({
        processed_at: new Date().toISOString(),
        process_error: processError,
      })
      .eq('provider', 'telnyx')
      .eq('payload->data->>id', providerEventId)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
})
