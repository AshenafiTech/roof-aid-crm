import { adminClient } from './admin-client.ts'

/**
 * Records every inbound webhook into `webhook_events` BEFORE doing
 * anything else. Cheap audit trail; lets us replay events from raw
 * payload + post-mortem any failed dispatch.
 *
 * Returns the row id so the dispatch handler can update `processed_at`
 * / `process_error` when work completes.
 */
export async function logWebhookEvent(input: {
  provider: 'telnyx' | 'sendgrid'
  eventType: string
  payload: unknown
  signatureOk: boolean
}): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('webhook_events')
    .insert({
      provider: input.provider,
      event_type: input.eventType,
      payload: input.payload,
      signature_ok: input.signatureOk,
    })
    .select('id')
    .single()

  if (error) {
    console.error('webhook_events insert failed', error)
    return null
  }
  return data.id
}

export async function markWebhookProcessed(
  id: string | null,
  err?: string,
): Promise<void> {
  if (!id) return
  await adminClient()
    .from('webhook_events')
    .update({
      processed_at: new Date().toISOString(),
      process_error: err ?? null,
    })
    .eq('id', id)
}
