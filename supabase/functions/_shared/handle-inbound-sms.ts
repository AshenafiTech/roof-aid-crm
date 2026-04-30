import { adminClient } from './admin-client.ts'

/**
 * STOP keyword pattern — case-insensitive, allows leading/trailing
 * whitespace. Matches the keywords the carriers themselves recognize:
 *   STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT
 *
 * Per client policy, DNC is INFORMATIONAL (not a hard block on Call /
 * SMS buttons). We still flag the prospect as DNC on a STOP — that's
 * the audit-trail and downstream-warning behavior — but the agent can
 * still proceed if they choose. The DncBanner in the UI surfaces the
 * warning.
 */
const STOP_REGEX = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i

interface TelnyxInboundPayload {
  id?: string
  text?: string
  from?: { phone_number?: string }
  to?: Array<{ phone_number?: string }>
  received_at?: string
}

/**
 * Dispatched from telnyx-webhook on a `message.received` event.
 *
 * Steps (idempotent — Telnyx may retry):
 *   1. Resolve tenant from the inbound `to` number.
 *   2. Match `from` to an existing prospect (may be null for unknown).
 *   3. UPSERT the inbound row into sms_logs (idempotent on telnyx_message_id).
 *   4. If body is a STOP keyword: flag the prospect DNC + audit log.
 *   5. Notify the assigned agent (if any) so the bell badges.
 *
 * Telnyx auto-replies to STOP/START on messaging-profile level (configure
 * once in the portal). We don't send our own auto-reply to avoid double-
 * sending and keep the messaging profile compliance setting authoritative.
 */
export async function handleInboundSms(payload: TelnyxInboundPayload): Promise<void> {
  const supa = adminClient()

  const messageId = payload.id ?? null
  const fromNum = payload.from?.phone_number ?? null
  const toNum = payload.to?.[0]?.phone_number ?? null
  const body = payload.text ?? ''
  const receivedAt = payload.received_at ?? new Date().toISOString()

  if (!fromNum || !toNum || !messageId) {
    console.warn('inbound sms: missing required fields', { messageId, fromNum, toNum })
    return
  }

  // 1. Tenant from inbound to-number
  const { data: tenantId, error: tenantErr } = await supa.rpc(
    'tenant_by_telnyx_number',
    { p_number: toNum },
  )
  if (tenantErr || !tenantId) {
    console.warn(`inbound sms: no tenant for to-number ${toNum}`, tenantErr)
    return
  }

  // 2. Match prospect by sender phone (may legitimately be null for unknown senders)
  const { data: prospectId } = await supa.rpc('prospect_by_phone', {
    p_tenant_id: tenantId,
    p_phone: fromNum,
  })

  // 3. Upsert the inbound row (idempotent on telnyx_message_id)
  await supa
    .from('sms_logs')
    .upsert(
      {
        telnyx_message_id: messageId,
        tenant_id: tenantId,
        prospect_id: prospectId,
        direction: 'inbound',
        body,
        delivery_status: 'received',
        from_number: fromNum,
        to_number: toNum,
        sent_at: receivedAt,
      },
      { onConflict: 'telnyx_message_id' },
    )

  // 4. STOP keyword auto-DNC (only when we matched a prospect)
  if (prospectId && STOP_REGEX.test(body)) {
    await supa
      .from('prospects')
      .update({
        do_not_call: true,
        do_not_call_reason: 'sms_stop_keyword',
        do_not_call_at: new Date().toISOString(),
      })
      .eq('id', prospectId)

    await supa.from('activities').insert({
      tenant_id: tenantId,
      prospect_id: prospectId,
      type: 'dnc',
      metadata: { source: 'sms_stop_keyword', body },
    })
  }

  // 5. Notify the assigned agent
  if (prospectId) {
    const { data: prospect } = await supa
      .from('prospects')
      .select('assigned_to, name')
      .eq('id', prospectId)
      .single()

    if (prospect?.assigned_to) {
      await supa.from('notifications').insert({
        tenant_id: tenantId,
        user_id: prospect.assigned_to,
        type: 'inbound_sms',
        title: `${prospect.name ?? 'Prospect'} sent an SMS`,
        body: body.slice(0, 100),
        related_id: prospectId,
        related_type: 'prospect',
      })
    }
  }
}
