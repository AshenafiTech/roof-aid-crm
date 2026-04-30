import { decode as b64decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { getSecret } from './get-secret.ts'

/**
 * Verifies a SendGrid Event Webhook signature.
 *
 * SendGrid signs `${timestamp}${body}` with ECDSA on P-256. The
 * signature ships in `X-Twilio-Email-Event-Webhook-Signature` and the
 * timestamp in `X-Twilio-Email-Event-Webhook-Timestamp`.
 *
 * The public key is set via `supabase secrets set SENDGRID_PUBLIC_KEY=
 * <value>` (copy from SendGrid → Settings → Mail Settings → Event
 * Webhook → "Verification Public Key").
 */
export async function verifySendgridSignature(
  body: string,
  sig: string | null,
  ts: string | null,
): Promise<boolean> {
  if (!sig || !ts) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  if (Math.abs(Date.now() / 1000 - tsNum) > 300) return false

  const pubB64 = getSecret('SENDGRID_PUBLIC_KEY')

  // SendGrid's verification public key is base64-encoded SPKI / DER.
  const key = await crypto.subtle.importKey(
    'spki',
    b64decode(pubB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )

  const data = new TextEncoder().encode(ts + body)

  // SendGrid's signature is base64 of the DER-encoded ECDSA pair.
  // WebCrypto expects the raw r||s concatenation, so we transcode.
  const der = b64decode(sig)
  const raw = derSignatureToRaw(der)

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    raw,
    data,
  )
}

/**
 * SendGrid signs with DER-encoded ECDSA, but WebCrypto wants the raw
 * 64-byte r||s concatenation. Strip the DER wrapper and pad each
 * integer to 32 bytes.
 */
function derSignatureToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature: missing 0x30')
  let i = 2
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f)

  if (der[i] !== 0x02) throw new Error('Invalid DER signature: missing r INTEGER')
  const rLen = der[i + 1]
  let r = der.slice(i + 2, i + 2 + rLen)
  i = i + 2 + rLen

  if (der[i] !== 0x02) throw new Error('Invalid DER signature: missing s INTEGER')
  const sLen = der[i + 1]
  let s = der.slice(i + 2, i + 2 + sLen)

  // Strip leading 0x00 padding inserted by DER for high-bit values.
  if (r[0] === 0x00 && r.length > 32) r = r.slice(1)
  if (s[0] === 0x00 && s.length > 32) s = s.slice(1)

  // Left-pad to exactly 32 bytes each.
  const out = new Uint8Array(64)
  out.set(r, 32 - r.length)
  out.set(s, 64 - s.length)
  return out
}
