// Telnyx REST API wrapper — server-only.
//
// Public surface used by:
//   - Onboarding wizard (searchAvailableNumbers, purchaseNumber)
//   - Settings page (releaseNumber, plus list/update via DB rows)
//   - Stage 2 softphone (initiateCall)
//   - Stage 3 SMS module (sendSms)
//
// All calls go through the shared `telnyxFetch` helper which handles
// auth, idempotency, retries, and typed errors.

import 'server-only'
import { telnyxFetch } from './fetch'
import { PartialPurchaseError, TelnyxError } from './errors'
import type {
  AvailableNumber,
  Capability,
  InitiateCallOpts,
  PurchasedNumber,
  SearchOpts,
  SendSmsOpts,
} from './types'

const DEFAULT_FEATURES: Capability[] = ['voice', 'sms']
const DEFAULT_LIMIT = 20

// ----------------------------------------------------------------------------
// Search inventory
// ----------------------------------------------------------------------------

interface AvailableNumberRow {
  phone_number: string
  region_information?: Array<{ region_type: string; region_name: string }>
  cost_information?: { monthly_cost?: string; currency?: string }
  features?: Array<{ name: string }>
}

export async function searchAvailableNumbers(
  opts: SearchOpts,
): Promise<AvailableNumber[]> {
  const features = opts.features ?? DEFAULT_FEATURES
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, 100)

  const res = await telnyxFetch<{ data: AvailableNumberRow[] }>({
    method: 'GET',
    path: '/available_phone_numbers',
    query: {
      'filter[national_destination_code]': opts.areaCode,
      'filter[features]': features,
      'filter[limit]': limit,
      'filter[country_code]': 'US',
    },
  })

  return (res.data ?? []).map((row) => {
    const locality = row.region_information?.find(
      (r) => r.region_type === 'rate_center' || r.region_type === 'location',
    )?.region_name ?? null
    const state = row.region_information?.find(
      (r) => r.region_type === 'state',
    )?.region_name ?? ''
    const monthly = Number(row.cost_information?.monthly_cost ?? '0')
    const caps = (row.features ?? [])
      .map((f) => f.name as string)
      .filter((name): name is Capability =>
        name === 'voice' || name === 'sms' || name === 'mms',
      )

    return {
      e164: row.phone_number,
      city: locality,
      region: state,
      monthly_cost_usd: Number.isFinite(monthly) ? monthly : 0,
      capabilities: caps,
    }
  })
}

// ----------------------------------------------------------------------------
// Purchase + auto-attach
// ----------------------------------------------------------------------------

interface NumberOrderResponse {
  data: {
    id: string
    status: string
    phone_numbers: Array<{
      id: string
      phone_number: string
      status: string
    }>
    messaging_profile_id?: string | null
    connection_id?: string | null
  }
}

interface PhoneNumberDetailResponse {
  data: {
    id: string
    phone_number: string
    messaging_profile_id?: string | null
    connection_id?: string | null
    features?: Array<{ name: string }>
  }
}

interface PhoneNumberListResponse {
  data: Array<{
    id: string
    phone_number: string
    messaging_profile_id?: string | null
    connection_id?: string | null
    features?: Array<{ name: string }>
  }>
}

// Telnyx processes number orders asynchronously. The POST often returns
// status="pending" — and even when it doesn't, the global
// `/phone_numbers/{id}` resource isn't queryable until the order
// reaches "success". Total wait is bounded so we don't hang on a stuck
// order (Telnyx support's worst case is ~tens of seconds; the typical
// US number completes in <2s).
const ORDER_POLL_INTERVAL_MS = 750
const ORDER_POLL_MAX_ATTEMPTS = 20 // ~15s total

/**
 * Purchase a US number and atomically attach it to a Telnyx connection
 * (Voice Call Control App OR a per-tenant Credentials Connection) plus
 * the platform's Roof-Aid messaging profile.
 *
 * `connectionId` is preferred — pass the tenant's
 * `telnyx_credential_connection_id` when set. Falls back to the
 * platform-wide `TELNYX_VOICE_APP_ID` env var when no per-tenant
 * connection exists yet (e.g., new tenants pre-multi-tenant rollout).
 *
 * Telnyx allows messaging_profile_id and connection_id directly on the
 * order, so the resulting number is wired to our webhook the instant
 * the order returns 200.
 */
export async function purchaseNumber(opts: {
  e164: string
  /** Tenant's Credentials Connection ID. Pass when available. */
  connectionId?: string
}): Promise<PurchasedNumber> {
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID
  const connectionId =
    opts.connectionId ??
    process.env.TELNYX_VOICE_APP_ID ??
    process.env.TELNYX_APP_ID

  if (!messagingProfileId || !connectionId) {
    throw new TelnyxError({
      message:
        'Calling is not fully configured. Please contact support.',
      status: 0,
    })
  }

  const order = await telnyxFetch<NumberOrderResponse>({
    method: 'POST',
    path: '/number_orders',
    body: {
      phone_numbers: [{ phone_number: opts.e164 }],
      messaging_profile_id: messagingProfileId,
      connection_id: connectionId,
    },
  })

  const assigned = order.data.phone_numbers[0]
  if (!assigned) {
    throw new TelnyxError({
      message: `Number order completed but returned no assigned number for ${opts.e164}. Please try again.`,
      status: 200,
      raw: order,
    })
  }

  // Poll the order to completion. The id inside `order.data.phone_numbers[i]`
  // is a NumberOrderPhoneNumber sub-resource id, NOT the global
  // /v2/phone_numbers/{id}. The global resource also doesn't exist until
  // the order status flips to "success" — querying earlier 404s.
  const pollStartedAt = Date.now()
  let finalStatus = order.data.status
  console.log(
    `[telnyx:order] created order_id=${order.data.id} e164=${opts.e164} initial_status=${finalStatus}`,
  )
  if (finalStatus !== 'success') {
    for (let attempt = 0; attempt < ORDER_POLL_MAX_ATTEMPTS; attempt++) {
      if (finalStatus === 'failure') {
        console.error(
          `[telnyx:order] failed order_id=${order.data.id} e164=${opts.e164} attempts=${attempt}`,
        )
        throw new TelnyxError({
          message: `Could not provision ${opts.e164}. Please try a different number.`,
          status: 0,
          raw: order,
        })
      }
      await new Promise((r) => setTimeout(r, ORDER_POLL_INTERVAL_MS))
      const polled = await telnyxFetch<NumberOrderResponse>({
        method: 'GET',
        path: `/number_orders/${order.data.id}`,
      })
      finalStatus = polled.data.status
      if (finalStatus === 'success') {
        console.log(
          `[telnyx:order] succeeded order_id=${order.data.id} e164=${opts.e164} attempts=${attempt + 1} ms=${Date.now() - pollStartedAt}`,
        )
        break
      }
    }
    if (finalStatus !== 'success') {
      // Order is in limbo: still "pending" after our poll budget. Telnyx may
      // eventually flip it to "success" (billing starts) or "failure" (free).
      // We can't know synchronously, so we throw PartialPurchaseError to give
      // the caller a chance to release-by-E.164. If the order never actually
      // billed, releaseNumberByE164 will return false (no-op; harmless). If
      // it did bill, the release succeeds and atomicity is preserved.
      console.warn(
        `[telnyx:order] poll-timeout order_id=${order.data.id} e164=${opts.e164} last_status=${finalStatus} ms=${Date.now() - pollStartedAt} — throwing PartialPurchaseError`,
      )
      throw new PartialPurchaseError({
        e164: opts.e164,
        orderId: order.data.id,
      })
    }
  } else {
    console.log(
      `[telnyx:order] immediate-success order_id=${order.data.id} e164=${opts.e164}`,
    )
  }

  // Resolve the global phone-number resource id by E.164. The sub-resource
  // id returned in the order response cannot be used against /phone_numbers.
  // Telnyx's filter endpoint is eventually consistent post-order, so we
  // retry with backoff. If it still fails, throw a typed error that carries
  // the E.164 so the caller can release-by-E.164 — keeping buy+attach atomic.
  const phoneRecord = await findPhoneNumberByE164WithRetry(assigned.phone_number)
  if (!phoneRecord) {
    throw new PartialPurchaseError({
      e164: assigned.phone_number,
      orderId: order.data.id,
    })
  }

  const capabilities = (phoneRecord.features ?? [])
    .map((f) => f.name)
    .filter((n): n is Capability => n === 'voice' || n === 'sms' || n === 'mms')

  return {
    telnyx_number_id: phoneRecord.id,
    e164: phoneRecord.phone_number,
    capabilities,
    messaging_profile_id: phoneRecord.messaging_profile_id ?? messagingProfileId,
    voice_app_id: phoneRecord.connection_id ?? connectionId,
  }
}

/**
 * Find an owned phone number's global resource record by E.164 string.
 * Returns null if not found in this account. Used after a number order
 * completes (the order response only includes a sub-resource id, not the
 * global one) and by the orphan-rescue importer.
 *
 * Telnyx's `filter[phone_number]` is the documented path but can return
 * empty under specific encoding edge cases — we try a couple of variants
 * before giving up.
 */
export async function findPhoneNumberByE164(
  e164: string,
): Promise<{
  id: string
  phone_number: string
  messaging_profile_id?: string | null
  connection_id?: string | null
  features?: Array<{ name: string }>
} | null> {
  const candidates = [e164, e164.startsWith('+') ? e164.slice(1) : `+${e164}`]
  for (const value of candidates) {
    const res = await telnyxFetch<PhoneNumberListResponse>({
      method: 'GET',
      path: '/phone_numbers',
      query: { 'filter[phone_number]': value },
    })
    const match = res.data?.find((r) => r.phone_number === e164) ?? res.data?.[0]
    if (match) return match
  }
  return null
}

// Backoff schedule between attempts. Total wait ~30s — enough to ride out
// Telnyx's eventual-consistency propagation after a successful number order.
const POST_ORDER_LOOKUP_DELAYS_MS = [500, 1500, 3000, 5000, 8000, 12000]

/**
 * Like `findPhoneNumberByE164`, but with exponential backoff. Used after a
 * number order completes — Telnyx's global `/phone_numbers` filter is
 * eventually consistent, so an immediate lookup can return empty even
 * though the number is fully provisioned and billing has started.
 *
 * Each attempt logs `[telnyx:lookup]` so the propagation behaviour is
 * visible in production logs; grep by E.164 to see how many retries a
 * given number required.
 */
export async function findPhoneNumberByE164WithRetry(
  e164: string,
): Promise<Awaited<ReturnType<typeof findPhoneNumberByE164>>> {
  const startedAt = Date.now()
  // First attempt has no delay.
  let found = await findPhoneNumberByE164(e164)
  if (found) {
    console.log(
      `[telnyx:lookup] hit e164=${e164} attempts=1 ms=${Date.now() - startedAt}`,
    )
    return found
  }
  for (let i = 0; i < POST_ORDER_LOOKUP_DELAYS_MS.length; i++) {
    const delay = POST_ORDER_LOOKUP_DELAYS_MS[i]
    console.log(
      `[telnyx:lookup] miss e164=${e164} attempt=${i + 1} retry_in_ms=${delay}`,
    )
    await new Promise((r) => setTimeout(r, delay))
    found = await findPhoneNumberByE164(e164)
    if (found) {
      console.log(
        `[telnyx:lookup] hit e164=${e164} attempts=${i + 2} ms=${Date.now() - startedAt}`,
      )
      return found
    }
  }
  console.warn(
    `[telnyx:lookup] exhausted e164=${e164} attempts=${POST_ORDER_LOOKUP_DELAYS_MS.length + 1} ms=${Date.now() - startedAt}`,
  )
  return null
}

// ----------------------------------------------------------------------------
// WebRTC login token (per-rep, short-lived)
// ----------------------------------------------------------------------------

interface CreateCredentialResponse {
  data: {
    id: string;
    sip_username: string;
    sip_password: string;
    user_name?: string;
  };
}

/**
 * Mint short-lived WebRTC SIP credentials for a rep, scoped to a specific
 * tenant Credentials Connection. The browser SDK passes these to
 * `new TelnyxRTC({ login, password })` to register.
 *
 * Single-step flow:
 *   POST /telephony_credentials → creates an ephemeral SIP user under
 *   the connection. Returns sip_username + sip_password directly.
 *
 * We don't reuse credentials across requests — a fresh credential per
 * mint keeps the revocation story trivial (delete the credential =
 * log the user out everywhere).
 *
 * Note: a JWT login_token is also available via POST /token but we use
 * SIP user/pass instead — better-tested in @telnyx/webrtc and avoids
 * a second API round-trip.
 */
export async function mintLoginToken(opts: {
  connectionId: string;
  name: string;
}): Promise<{
  sip_username: string;
  sip_password: string;
  credential_id: string;
}> {
  const cred = await telnyxFetch<CreateCredentialResponse>({
    method: "POST",
    path: "/telephony_credentials",
    body: {
      connection_id: opts.connectionId,
      name: opts.name,
    },
  });
  const c = cred.data;
  if (!c.sip_username || !c.sip_password) {
    throw new TelnyxError({
      message: "Phone service credential response was incomplete. Please try again.",
      status: 0,
      raw: cred,
    });
  }
  return {
    sip_username: c.sip_username,
    sip_password: c.sip_password,
    credential_id: c.id,
  };
}

// ----------------------------------------------------------------------------
// Per-tenant Credentials Connection (used by WebRTC softphone)
// ----------------------------------------------------------------------------

interface CredentialConnectionResponse {
  data: {
    id: string;
    user_name: string;
    connection_name: string;
  };
}

/**
 * Create a Telnyx Credentials-type SIP Connection for a tenant.
 * The returned `id` is what we store on `tenants.telnyx_credential_connection_id`.
 * `user_name` and `password` are the SIP credentials — not directly used by the
 * WebRTC SDK (which auths via short-lived /v2/telephony_credentials login_tokens),
 * but kept in case ops needs SIP softphone debugging.
 */
export async function createCredentialConnection(opts: {
  connectionName: string;
  userName: string;
  password: string;
  outboundVoiceProfileId?: string;
}): Promise<{ id: string; user_name: string }> {
  const res = await telnyxFetch<CredentialConnectionResponse>({
    method: "POST",
    path: "/credential_connections",
    body: {
      connection_name: opts.connectionName,
      user_name: opts.userName,
      password: opts.password,
      outbound_voice_profile_id: opts.outboundVoiceProfileId,
      // Sensible defaults for WebRTC use
      anchorsite_override: "Latency",
      dtmf_type: "RFC 2833",
      encode_contact_header_enabled: false,
      generate_ringback_tone: true,
      ios_push_credential_id: null,
      // OPUS first for browser quality, fall back to G.711 for PSTN
      inbound: {
        codecs: ["OPUS", "G722", "G711U", "G711A"],
        sip_compact_headers_enabled: true,
      },
    },
  });
  return { id: res.data.id, user_name: res.data.user_name };
}

export async function deleteCredentialConnection(connectionId: string): Promise<void> {
  await telnyxFetch<void>({
    method: "DELETE",
    path: `/credential_connections/${connectionId}`,
    idempotent: false,
  });
}

/**
 * Move a phone number to a different Telnyx connection. Used when:
 *   - Onboarding's purchaseNumber needs to migrate the number from the
 *     platform-wide voice app to the tenant's connection
 *   - We're reassigning a number from one tenant to another (e.g. dev/test)
 */
export async function setNumberConnection(opts: {
  telnyxNumberId: string;
  connectionId: string;
}): Promise<void> {
  await telnyxFetch<void>({
    method: "PATCH",
    path: `/phone_numbers/${opts.telnyxNumberId}`,
    body: { connection_id: opts.connectionId },
    idempotent: false,
  });
}

// ----------------------------------------------------------------------------
// Release back to Telnyx inventory
// ----------------------------------------------------------------------------

/**
 * Release a number back to Telnyx (stops monthly billing).
 * Soft-delete the corresponding tenant_phone_numbers row first
 * (status='released') so log entries that reference it stay valid.
 */
export async function releaseNumber(telnyxNumberId: string): Promise<void> {
  await telnyxFetch<void>({
    method: 'DELETE',
    path: `/phone_numbers/${telnyxNumberId}`,
    idempotent: false, // DELETE is naturally idempotent on Telnyx side
  })
}

/**
 * Release by E.164 — used to roll back a purchase when we have the dialed
 * number string but never captured the global Telnyx resource id (e.g. the
 * order succeeded but the post-order lookup eventually-consistency-failed).
 *
 * Returns true on successful release, false if the number could not be
 * located on Telnyx within the retry window. Callers MUST log false as
 * CRITICAL — the number is paid for and orphaned.
 */
export async function releaseNumberByE164(e164: string): Promise<boolean> {
  const found = await findPhoneNumberByE164WithRetry(e164)
  if (!found) {
    console.warn(
      `[telnyx:release] could-not-locate e164=${e164} — number not findable on Telnyx, release skipped`,
    )
    return false
  }
  try {
    await releaseNumber(found.id)
    console.log(
      `[telnyx:release] released e164=${e164} telnyx_number_id=${found.id}`,
    )
    return true
  } catch (err) {
    console.error(
      `[telnyx:release] delete-failed e164=${e164} telnyx_number_id=${found.id} error=${err instanceof Error ? err.message : String(err)}`,
    )
    throw err
  }
}

// ----------------------------------------------------------------------------
// SMS — Stage 3 primitive
// ----------------------------------------------------------------------------

interface MessageResponse {
  data: {
    id: string
    to: Array<{ phone_number: string; status: string }>
  }
}

export async function sendSms(opts: SendSmsOpts): Promise<{ messageId: string }> {
  const res = await telnyxFetch<MessageResponse>({
    method: 'POST',
    path: '/messages',
    body: {
      from: opts.from,
      to: opts.to,
      text: opts.text,
    },
  })
  return { messageId: res.data.id }
}

// ----------------------------------------------------------------------------
// Voice — Stage 2 primitive
// ----------------------------------------------------------------------------

interface CallResponse {
  data: {
    call_control_id: string
    call_session_id: string
  }
}

/**
 * Initiate an outbound call via the Roof-Aid CRM Call Control App.
 * Audio is bridged into the agent's SIP extension — the WebRTC SDK
 * picks it up on the agent's side.
 */
export async function initiateCall(
  opts: InitiateCallOpts,
): Promise<{ callControlId: string }> {
  const voiceAppId =
    process.env.TELNYX_VOICE_APP_ID ?? process.env.TELNYX_APP_ID
  if (!voiceAppId) {
    throw new TelnyxError({
      message: 'Calling is not fully configured. Please contact support.',
      status: 0,
    })
  }

  const res = await telnyxFetch<CallResponse>({
    method: 'POST',
    path: '/calls',
    body: {
      connection_id: voiceAppId,
      from: opts.from,
      to: opts.to,
      // Agent extension is bridged in once the call is answered;
      // Stage 2 wires this into the call.answered event handler.
      // Including here so it's visible in the order.
      // (Telnyx ignores unknown fields on /calls; harmless if SDK changes.)
    },
  })
  // Note: agentExtension param is currently informational; bridging
  // happens in the call.answered handler in Stage 2.
  void opts.agentExtension
  return { callControlId: res.data.call_control_id }
}
