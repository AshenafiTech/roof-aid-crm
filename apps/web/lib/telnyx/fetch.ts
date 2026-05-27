// Internal fetch helper for the Telnyx REST API.
//
// Responsibilities:
//   - Authorization: Bearer <TELNYX_API_KEY>
//   - Idempotency-Key on POSTs that mutate (number orders, sends, dials)
//   - Retry on 429 + 5xx with exponential backoff (3 tries max)
//   - Throws TelnyxError on non-2xx so callers don't need to parse error JSON
//
// Keep this module server-only — it reads TELNYX_API_KEY from process.env
// and must never be imported into a client component.

import 'server-only'
import { TelnyxError, fromTelnyxResponse } from './errors'

const BASE_URL = 'https://api.telnyx.com/v2'
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3

interface RequestInit {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  path: string
  query?: Record<string, string | number | string[] | undefined>
  body?: unknown
  /** Set false to skip the Idempotency-Key header (e.g. on already-idempotent endpoints). */
  idempotent?: boolean
}

function buildQuery(query?: RequestInit['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item))
    } else {
      params.append(k, String(v))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function telnyxFetch<T>(init: RequestInit): Promise<T> {
  console.log(`[telnyx-trace] → ${init.method} ${init.path}`)
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    throw new TelnyxError({
      message: 'Phone service is not configured on the server. Please contact support.',
      status: 0,
    })
  }

  const url = `${BASE_URL}${init.path}${buildQuery(init.query)}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.method === 'POST' && init.idempotent !== false) {
    headers['Idempotency-Key'] = crypto.randomUUID()
  }

  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch (err) {
      lastError = err
      if (attempt === MAX_RETRIES - 1) break
      await sleep(2 ** attempt * 250) // 250ms, 500ms, 1s
      continue
    }

    if (res.ok) {
      // 204 No Content has no body
      if (res.status === 204) return undefined as T
      const text = await res.text()
      if (!text) return undefined as T
      return JSON.parse(text) as T
    }

    // Parse error body once
    let errBody: unknown = null
    try {
      errBody = await res.json()
    } catch {
      errBody = { raw: await res.text().catch(() => '') }
    }

    if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES - 1) {
      const backoff = 2 ** attempt * 500 // 500ms, 1s, 2s
      await sleep(backoff)
      continue
    }

    // Log enough context to triage in dev logs without leaking the API key.
    console.error(
      `[telnyx] ${init.method} ${init.path} → ${res.status}`,
      { body: errBody },
    )
    throw fromTelnyxResponse(res.status, errBody)
  }

  // Network/transport-level failure after all retries
  throw new TelnyxError({
    message: `Phone service request failed after ${MAX_RETRIES} attempts: ${(lastError as Error)?.message ?? 'unknown error'}`,
    status: 0,
    raw: lastError,
  })
}
