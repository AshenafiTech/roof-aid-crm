# Fix: Telnyx "404 Resource not found" when buying a phone number

## Purpose

Tenants saw `Telnyx 404: Resource not found — The requested resource or URL
could not be found.` when clicking **Buy & continue** in the onboarding
phone-picker (also reachable from Settings → Phone numbers → Setup). The
number order succeeded on Telnyx's side, but the call that followed
immediately afterwards threw and aborted the post-purchase DB write — so
the tenant was potentially being charged for a number that was never
attached to their account.

## Root cause

Two interacting issues in `apps/web/lib/telnyx/client.ts` `purchaseNumber`:

### 1. Wrong identifier used to look up the global phone-number resource

After `POST /number_orders`, the code did:

```ts
const assigned = order.data.phone_numbers[0]
const detail = await telnyxFetch<...>({ method: 'GET', path: `/phone_numbers/${assigned.id}` })
```

In Telnyx's response, each `phone_numbers[i]` is a `record_type:
"number_order_phone_number"` — a sub-resource scoped under the order
itself, with `id` that lives at
`/v2/number_orders/{order_id}/phone_numbers/{id}`. It is **not** the
global phone-number id used at `/v2/phone_numbers/{id}`. There is no
`phone_number_id` field on the sub-resource pointing at the global one;
you must look it up by E.164 yourself.

So `GET /phone_numbers/{sub_resource_id}` always 404s.

### 2. Number orders complete asynchronously

Even with the correct global id, `/v2/phone_numbers/{id}` is **not
queryable** until the parent number order's `status` flips to `success`.
The POST often returns `status: "pending"`. Querying before completion
returns 404 ("Resource not found") because Telnyx hasn't provisioned the
owned-number record yet.

## Fix

`apps/web/lib/telnyx/client.ts`:

1. **Poll the order** (`GET /number_orders/{id}`) until `status === "success"`
   (or `failure` — surface that as a typed error). Bounded to ~15s
   (`ORDER_POLL_MAX_ATTEMPTS * ORDER_POLL_INTERVAL_MS`).
2. **Resolve the global phone-number resource by E.164** using
   `GET /phone_numbers?filter[phone_number]=<E.164>`, then read
   `data[0].id`, `messaging_profile_id`, `connection_id`, and `features`
   from that record.

The returned `PurchasedNumber.telnyx_number_id` now correctly references
the global phone number id — matching what the rest of the system
(release, SMS, voice routing) already expects.

## Tradeoffs

- The purchase server action now takes ~1–3s longer in the typical case
  (one extra GET on `/number_orders` after a short wait). For a one-off
  onboarding step this is well within acceptable.
- If Telnyx's order takes longer than ~15s, we surface a clear error
  instructing the user to check the Telnyx portal — better than silently
  succeeding and leaving the DB row missing.

## Files touched

- `apps/web/lib/telnyx/client.ts` — rewrote post-order portion of
  `purchaseNumber`, added `PhoneNumberListResponse` type and the
  polling constants.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` → clean.
- Manual: pick an area code, choose a number, hit **Buy & continue** →
  number is purchased on Telnyx, `tenant_phone_numbers` row is inserted
  with the correct `telnyx_number_id`, wizard proceeds.

## Notes

- The companion `safeReleaseNumber` path is unaffected — it operates on
  the (now correctly-stored) global id.
- If we later move to webhook-driven order completion
  (`number_order.status.changed`), the polling block can be replaced by
  a short await on a "ready" signal.
