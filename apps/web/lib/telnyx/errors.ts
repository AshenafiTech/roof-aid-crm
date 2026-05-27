// TelnyxError — typed wrapper around Telnyx's structured error response.
//
// Telnyx 4xx/5xx responses look like:
//   { "errors": [{ "code": "10009", "title": "...", "detail": "...", "meta": {...} }] }
//
// We surface the first error's code + detail so callers can switch on
// `error.code` without parsing the body again.

export class TelnyxError extends Error {
  readonly status: number
  readonly code: string | null
  readonly detail: string | null
  readonly raw: unknown

  constructor(opts: {
    message: string
    status: number
    code?: string | null
    detail?: string | null
    raw?: unknown
  }) {
    super(opts.message)
    this.name = 'TelnyxError'
    this.status = opts.status
    this.code = opts.code ?? null
    this.detail = opts.detail ?? null
    this.raw = opts.raw
  }
}

interface TelnyxErrorBody {
  errors?: Array<{
    code?: string
    title?: string
    detail?: string
    meta?: Record<string, unknown>
  }>
}

// Order succeeded with the upstream phone-provider (number is paid for)
// but the post-order global resource lookup could not resolve within the
// retry window. The e164 is guaranteed to be the just-purchased number,
// so callers can release it via `releaseNumberByE164` to keep the
// buy+attach flow atomic.
//
// `message` is user-facing on rollback failure paths — kept vendor-neutral.
export class PartialPurchaseError extends TelnyxError {
  readonly e164: string
  readonly orderId: string

  constructor(opts: { e164: string; orderId: string }) {
    super({
      message: `Number ${opts.e164} was provisioned but could not be confirmed within the wait window. The number is held by the phone provider; the caller must attempt release-by-E.164 to keep the purchase atomic.`,
      status: 0,
    })
    this.name = 'PartialPurchaseError'
    this.e164 = opts.e164
    this.orderId = opts.orderId
  }
}

export function fromTelnyxResponse(status: number, body: unknown): TelnyxError {
  const errs = (body as TelnyxErrorBody | null)?.errors ?? []
  const first = errs[0]
  const message = first
    ? `Phone service ${status}: ${first.title ?? first.code ?? 'error'}${first.detail ? ` — ${first.detail}` : ''}`
    : `Phone service ${status}: request failed`
  return new TelnyxError({
    message,
    status,
    code: first?.code ?? null,
    detail: first?.detail ?? null,
    raw: body,
  })
}
