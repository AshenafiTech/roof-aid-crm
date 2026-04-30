import { decode as b64decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { getSecret } from './get-secret.ts'

/**
 * Verifies a Telnyx webhook signature.
 *
 * Telnyx signs the raw body with Ed25519 and posts the signature in
 * `telnyx-signature-ed25519`, the timestamp in `telnyx-timestamp`. The
 * signed payload is `${timestamp}|${body}`. Reject signatures older
 * than 5 minutes to prevent replay attacks.
 *
 * The Ed25519 public key is set via `supabase secrets set
 * TELNYX_PUBLIC_KEY=<value>` (paste from Telnyx Portal → Webhooks →
 * Public Key).
 */
export async function verifyTelnyxSignature(
  body: string,
  sig: string | null,
  ts: string | null,
): Promise<boolean> {
  if (!sig || !ts) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  if (Math.abs(Date.now() / 1000 - tsNum) > 300) return false

  const pubB64 = getSecret('TELNYX_PUBLIC_KEY')

  const key = await crypto.subtle.importKey(
    'raw',
    b64decode(pubB64),
    { name: 'Ed25519' },
    false,
    ['verify'],
  )

  const data = new TextEncoder().encode(`${ts}|${body}`)
  return crypto.subtle.verify('Ed25519', key, b64decode(sig), data)
}
