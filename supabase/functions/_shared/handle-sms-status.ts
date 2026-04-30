import { adminClient } from './admin-client.ts'

interface TelnyxOutboundStatusPayload {
  id?: string
  from?: { phone_number?: string }
  to?: Array<{ phone_number?: string }>
}

type DeliveryStatus = 'sent' | 'delivered' | 'failed'

/**
 * Dispatched from telnyx-webhook on `message.sent` / `message.delivered`
 * / `message.failed`. Two-phase update strategy:
 *
 *   Phase A (already-stamped): if a row already has the matching
 *   telnyx_message_id, just update its delivery_status. This handles
 *   retries and the second-and-subsequent webhook for the same message.
 *
 *   Phase B (first time): the send_sms RPC inserted the row WITHOUT
 *   a telnyx_message_id (pg_net is fire-and-forget — we don't capture
 *   Telnyx's response synchronously). On the FIRST status webhook we
 *   match the most recent queued/sent outbound row by from+to with no
 *   message id yet, and stamp it.
 *
 * Idempotent — replaying the same event a second time hits Phase A and
 * is a no-op delta.
 */
export async function handleSmsStatusUpdate(
  payload: TelnyxOutboundStatusPayload,
  newStatus: DeliveryStatus,
): Promise<void> {
  const supa = adminClient()
  const messageId = payload.id
  const fromNum = payload.from?.phone_number
  const toNum = payload.to?.[0]?.phone_number

  if (!messageId) {
    console.warn('sms status: missing message id', payload)
    return
  }

  // Phase A
  const { data: byId } = await supa
    .from('sms_logs')
    .select('id')
    .eq('telnyx_message_id', messageId)
    .maybeSingle()

  if (byId) {
    await supa
      .from('sms_logs')
      .update({ delivery_status: newStatus })
      .eq('id', byId.id)
    return
  }

  // Phase B — first webhook for this message; stamp the queued row.
  if (!fromNum || !toNum) return

  const { data: queued } = await supa
    .from('sms_logs')
    .select('id')
    .eq('direction', 'outbound')
    .eq('from_number', fromNum)
    .eq('to_number', toNum)
    .in('delivery_status', ['queued', 'sent'])
    .is('telnyx_message_id', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (queued) {
    await supa
      .from('sms_logs')
      .update({
        delivery_status: newStatus,
        telnyx_message_id: messageId,
      })
      .eq('id', queued.id)
  }
  // If we found nothing to stamp, the message was sent outside our
  // system (e.g. directly via Telnyx Portal). Drop the event silently;
  // it's already in webhook_events for audit.
}
