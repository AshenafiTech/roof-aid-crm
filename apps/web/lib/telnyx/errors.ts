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

export function fromTelnyxResponse(status: number, body: unknown): TelnyxError {
  const errs = (body as TelnyxErrorBody | null)?.errors ?? []
  const first = errs[0]
  const message = first
    ? `Telnyx ${status}: ${first.title ?? first.code ?? 'error'}${first.detail ? ` — ${first.detail}` : ''}`
    : `Telnyx ${status}: request failed`
  return new TelnyxError({
    message,
    status,
    code: first?.code ?? null,
    detail: first?.detail ?? null,
    raw: body,
  })
}
