// Telnyx webhook signature verification.
// Telnyx signs every webhook with Ed25519. The signed payload is
// "<timestamp>|<raw_body>" — both come from request headers / body.
// Reject events whose timestamp is more than 5 minutes off — that's
// the documented anti-replay window.

import { decodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const REPLAY_WINDOW_SECONDS = 5 * 60

export interface VerifyResult {
  ok: boolean
  reason?: 'missing_headers' | 'stale_timestamp' | 'bad_signature' | 'no_public_key'
}

/**
 * Verify a Telnyx Ed25519 webhook signature.
 *
 * @param rawBody     The exact request body as a string (do NOT re-stringify JSON).
 * @param signatureB64 Base64-encoded signature from header `telnyx-signature-ed25519`.
 * @param timestamp   String value of header `telnyx-timestamp` (Unix seconds).
 * @param publicKeyB64 Base64-encoded Ed25519 public key from Telnyx portal.
 */
export async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  publicKeyB64: string | null,
): Promise<VerifyResult> {
  if (!publicKeyB64) return { ok: false, reason: 'no_public_key' }
  if (!signatureB64 || !timestamp) return { ok: false, reason: 'missing_headers' }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'missing_headers' }
  const skew = Math.abs(Date.now() / 1000 - ts)
  if (skew > REPLAY_WINDOW_SECONDS) return { ok: false, reason: 'stale_timestamp' }

  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'raw',
      decodeBase64(publicKeyB64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
  } catch {
    return { ok: false, reason: 'no_public_key' }
  }

  const signedMessage = new TextEncoder().encode(`${timestamp}|${rawBody}`)

  try {
    const ok = await crypto.subtle.verify(
      'Ed25519',
      key,
      decodeBase64(signatureB64),
      signedMessage,
    )
    return ok ? { ok: true } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
}
