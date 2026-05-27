# Atomic Number Purchase + Attach

## Purpose

When a new customer clicks the **Set it up** banner and picks a number, the
expected outcome is binary: either the number is bought *and* attached to
their tenant, or nothing happens at all. The previous implementation had a
silent failure window where the Telnyx order succeeded (money committed) but
the post-order global resource lookup returned empty due to Telnyx's
eventually-consistent `/phone_numbers` listing endpoint. When that happened:

- `purchaseNumber` threw with no E.164 surfaced to the caller.
- `purchaseAndAttachNumber`'s catch block tried to release using
  `purchasedTelnyxId`, which was still `null` (it was assigned on the line
  after the await).
- Net result: the number stayed paid for on Telnyx with no
  `tenant_phone_numbers` row. The customer saw an error, retried, and
  produced another orphan.

This is the failure pattern visible in the four `nwaroofingWebRTC` orphans
from earlier testing.

## What changed

Three coordinated edits in [lib/telnyx/errors.ts](../../apps/web/lib/telnyx/errors.ts),
[lib/telnyx/client.ts](../../apps/web/lib/telnyx/client.ts), and
[app/onboarding/actions.ts](../../apps/web/app/onboarding/actions.ts).

### 1 · `PartialPurchaseError` — typed signal for the post-order race

New error subclass of `TelnyxError` that carries the just-purchased `e164`
and the Telnyx `orderId`. Thrown only when the Telnyx order has reached
`"success"` but the global phone-number lookup never resolved within the
retry window. Callers can `instanceof`-check it to surface the E.164 into
the rollback path.

### 2 · `findPhoneNumberByE164WithRetry` — propagation-aware lookup

Wraps the existing `findPhoneNumberByE164` in an exponential backoff loop:
`500ms → 1.5s → 3s → 5s → 8s → 12s` between attempts, ~30 seconds total.
Telnyx's filter endpoint is eventually consistent after a successful number
order; this rides out the propagation window.

`purchaseNumber` now uses this wrapper after the order succeeds. If the
lookup still fails after the retries, it throws `PartialPurchaseError`
instead of a generic `TelnyxError` — the change that lets the caller release
by E.164.

### 3 · `releaseNumberByE164(e164)` — rollback without a global id

Looks up the number with the same retry strategy, then `DELETE`s it via
`releaseNumber`. Returns `boolean`:
- `true` — successfully released, no orphan.
- `false` — number could not be located on Telnyx within the retry window.
  Caller MUST log this as CRITICAL; the only remaining lever is manual rescue.

### 4 · `purchaseAndAttachNumber` — explicit atomicity contract

Restructured around two locals:

```ts
let purchasedE164: string | null = null;  // "money committed?"
let attached = false;                      // "DB row written?"
```

`purchasedE164` is assigned **immediately** after `purchaseNumber` returns
successfully — i.e. on the same line as the `await`, not the one after. From
that point on, every code path either flips `attached = true` (the
`tenant_phone_numbers` INSERT succeeded) or falls through to the catch.

The catch block now:

1. If the thrown error is `PartialPurchaseError`, pulls the `e164` out of
   it so we have the rollback handle even when the lookup never resolved.
2. If `purchasedE164` is set and `attached` is false, calls
   `safeReleaseByE164(purchasedE164, …)` — which retries the lookup,
   releases on success, and logs CRITICAL on a double-failure.
3. Returns `{ ok: false, error: "Number purchase rolled back — …" }` so
   the user-visible failure is a clean state, not an ambiguous one.

The INSERT failure path used to be a separate branch with its own
`safeReleaseNumber` call. It's now collapsed into a `throw new Error(...)`
so a single catch handles all post-purchase failures the same way.

## Atomicity guarantee

| Failure point | Money committed? | Rollback path | Final state |
|---|---|---|---|
| Auth / validation / `existingPrimary` check | No | n/a | No-op; clean error |
| Tenant slug lookup / `ensureTenantTelnyxConnection` throws | No (numbers) — orphan Telnyx *connection* (free) possible | n/a | Cosmetic only |
| Telnyx order returns `"failure"` mid-poll | No | n/a | No-op; clean error |
| Telnyx order polling exhausts with status `"pending"` | **Possibly** | `PartialPurchaseError` (carries E.164) → `releaseNumberByE164`. If order never billed, release returns false harmlessly. If it eventually billed, release succeeds. | Released or no-op; clean error |
| Order succeeds, **post-order lookup retry exhausts** | Yes | `PartialPurchaseError` → `releaseNumberByE164` (retries lookup again) | Released; clean error |
| `tenant_phone_numbers` INSERT fails (RLS, FK, unique constraint, network) | Yes | thrown into catch → idempotent DB cleanup → `releaseNumberByE164` | Released; clean error |
| INSERT commits in Postgres but API response is lost | Yes — and a DB row exists | catch's idempotent `DELETE` removes the row → `releaseNumberByE164` | Both sides clean; retry works |
| Anything else throws after `purchasedE164` is set | Yes | catch → idempotent DB cleanup → `releaseNumberByE164` | Released; clean error |
| `revalidatePath` throws after `attached = true` | Yes | catch sees `attached = true` → skips release | Number remains attached; cache stale (harmless) |
| Release itself fails (Telnyx DELETE or lookup unreachable for full ~30s) | Yes | CRITICAL log with E.164 + tenant id | Orphan — flagged in logs for manual rescue |

The only remaining orphan condition is the **double-failure**: Telnyx
accepts the order, then for the same single request is simultaneously
unable to serve **both** the lookup (~30s of retries) and the DELETE
(another lookup-then-DELETE round). In that case the action returns
`{ ok: false }` and a CRITICAL log line emits the E.164 plus tenant id so
ops can either re-run `importExistingPhoneNumber` or rescue manually with
the SQL recipe in this docs folder.

## Observability — how to triage a failed attempt

Every call to `purchaseAndAttachNumber` opens a short hex **trace id** that
prefixes every log line emitted by that attempt. Telnyx-side log lines for
the same request can be cross-referenced by the E.164.

### Log line conventions

```
[onboarding:purchase] <traceId> phase=<phase> tenant=<id> e164=<phone> { …detail }
[telnyx:lookup]       hit|miss|exhausted e164=<phone> attempts=N [ms=…]
[telnyx:order]        created|succeeded|failed|poll-timeout order_id=<id> e164=<phone> …
[telnyx:release]      released|delete-failed|could-not-locate e164=<phone> …
[telnyx-trace]        → METHOD /path                      (every HTTP call to Telnyx)
[telnyx]              METHOD /path → STATUS              (only on Telnyx 4xx/5xx, with body)
```

### Phase names from `purchaseAndAttachNumber`

| Phase | Meaning | Severity |
|---|---|---|
| `start` | Action invoked. Includes requested e164 + label. | info |
| `auth-ok` | requireTenantOwner passed. Logs role + user_id. | info |
| `existing-primary-block` | Tenant already has a primary; refusing. | warn |
| `tenant-lookup-failed` | DB read for tenant slug returned nothing. | error |
| `connection-ready` | `ensureTenantTelnyxConnection` returned a connection_id. | info |
| `purchase-started` | About to POST /number_orders. | info |
| `purchase-ok` | Order succeeded + global lookup resolved. Includes telnyx_number_id + purchase_ms. | info |
| `partial-purchase` | `PartialPurchaseError` caught — order may have billed but lookup or polling never resolved. e164 surfaced into rollback. | warn |
| `insert-failed` | Supabase INSERT errored. Includes db_error, db_code, db_details. | error |
| `attached` | Whole flow succeeded. Includes row_id + total_ms. | info |
| `rollback-started` | About to undo a paid-but-not-attached state. | warn |
| `rollback-db-cleaned` | Idempotent DELETE removed N stale rows (usually 0). | info |
| `rollback-db-cleanup-failed` | DELETE itself errored. Likely needs manual rescue if a stale row is present. | error |
| `rollback-telnyx-released` | Number successfully released back to Telnyx. Clean failure. | warn |
| `rollback-orphan-critical` | **Money committed, release failed.** Includes action_required hint. | error |
| `failed-pre-purchase` | Threw before money was ever committed. | error |

### Triage recipes

**One specific user complained**
```bash
vercel logs --follow | grep e164=+15129806579
```
Returns every line touching that number across `[onboarding:*]`, `[telnyx:*]`, and `[telnyx-trace]`.

**Walk one attempt end-to-end**
```bash
# 1. Find the trace id from any log line for the failed attempt
vercel logs | grep 'e164=+15129806579' | grep 'phase=start'
# 2. Grep everything for that trace
vercel logs | grep '<traceId>'
```

**Watch for orphans in real time**
```bash
vercel logs --follow | grep rollback-orphan-critical
```
Each match is an actionable rescue case — the line itself contains the
e164 and the manual-rescue instructions.

**Hot-find any failed attempt**
```bash
vercel logs --follow | grep -E 'phase=(insert-failed|rollback-orphan-critical|failed-pre-purchase|tenant-lookup-failed)'
```

**Telnyx propagation slowness**
```bash
vercel logs | grep '\[telnyx:lookup\] hit' | grep -oE 'attempts=[0-9]+'
```
Use this to spot trends in how many retries the post-order lookup needs.
If most are attempts=1, propagation is fast. If you see many ≥3, Telnyx
is being sluggish that day.

## What is NOT closed by this change

- **Concurrent duplicate submits.** If the same owner POSTs the action
  twice within the same ~5s window (two tabs, accidental double-click that
  beats `useTransition`), the `existingPrimary` check can pass twice and
  two number orders get placed. The button is `disabled` while the
  transition is pending in [number-picker-form.tsx:254](../../apps/web/components/shared/number-picker-form.tsx#L254), which mitigates single-tab cases but not cross-tab. Closing this would
  need either a unique partial index on `tenant_phone_numbers (tenant_id) WHERE is_primary AND status='active'` or an advisory lock keyed by tenant
  id at the start of the action. Filed as a follow-up; observed
  frequency = zero so far.
- **Orphan Credentials Connections on Telnyx.** If
  `ensureTenantTelnyxConnection` creates the Telnyx connection but the
  Supabase `update` that stamps it on `tenants` fails, the Telnyx-side
  connection is left dangling. These are free (no billing), so this is
  cosmetic clutter rather than a money problem. Could be closed by
  reading-back the connection by name on next attempt before re-creating.
- **`addPhoneNumber` on the admin Settings page** ([admin/settings/phone-numbers/actions.ts:138](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts#L138)) still uses the older release-by-global-id pattern. Same fix applies; deferred to a separate change because the customer-facing onboarding banner is the priority path.

## What this doesn't change

- The user-facing flow (banner → `/onboarding` → `<NumberPicker />` →
  search → buy) is unchanged.
- `addPhoneNumber` in [admin/settings/phone-numbers/actions.ts](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts)
  still has the old release-by-global-id pattern. It's the
  add-an-additional-number path used by tenants who already have a primary;
  the same fix would apply there but is a separate change. Filed
  mentally — touch when next we audit that path.

## Why not a `pending_purchases` table + cron?

A two-phase-commit pattern (write a `pending` row first, then buy, then
promote) would close the rare double-failure window. It was considered and
deferred because:

1. The current change collapses the failure rate to "Telnyx must be down
   for 30+ seconds during the same single request" — extremely rare.
2. Adding a `pending` state requires a schema change, a reconciler cron,
   and tooling to retire stale `pending` rows. Not justified for the
   residual risk.

If we ever observe an orphan in the CRITICAL log path after this change
ships, that's the cue to revisit.
