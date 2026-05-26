# Orphan phone-number rescue

## Purpose

When `purchaseAndAttachNumber` (onboarding) or `addPhoneNumber` (settings)
purchases a number on Telnyx but fails before writing the
`tenant_phone_numbers` row, the number is paid for but never reachable
from the app. This doc covers (a) the helper added to rescue these
orphans and (b) the supporting hardening of the post-purchase lookup so
new orders don't orphan in the first place.

## Background

`purchaseNumber` in `apps/web/lib/telnyx/client.ts` must obtain the
**global Telnyx phone-number id** (19-digit numeric, e.g.
`2948723401243494106`) to store on `tenant_phone_numbers.telnyx_number_id`.
Telnyx's `POST /number_orders` only returns sub-resource UUIDs scoped to
the order — those will 404 against `/v2/phone_numbers/{id}`. The fix:

1. Poll `/number_orders/{id}` until `status === "success"`.
2. Look the number up by E.164 via `findPhoneNumberByE164(e164)`.

If step 2 returns no row, the order succeeded but we cannot derive the
global id — the number is orphaned on Telnyx with no DB row.

## New helper: `findPhoneNumberByE164(e164)`

`apps/web/lib/telnyx/client.ts`

- Tries `GET /phone_numbers?filter[phone_number]=<E.164>` with the
  `+` prefix, then again without it as a fallback (some encoding paths
  through Telnyx's filter parser have returned empty in our testing).
- Returns the matched record or `null`. Never throws on "not found".
- Exported so the rescue action can reuse it.

## New rescue action: `importExistingPhoneNumber({ e164, label })`

`apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts`

Auth: tenant owner / admin / super_admin (same as `addPhoneNumber`).

Behavior:

1. Validates E.164 (`+1XXXXXXXXXX`).
2. Aborts if any tenant already has a row for that E.164.
3. Calls `findPhoneNumberByE164` — fails fast with a clear error if
   Telnyx has no owned number matching.
4. Inserts a `tenant_phone_numbers` row with the correct numeric
   `telnyx_number_id` from Telnyx, default `label`, `is_primary=true`
   only if no other active number exists for this tenant.

Does **not** create a Telnyx Credentials Connection — the import flow
assumes the number's connection_id (set when ordered) is already valid.

## Running the rescue (no UI yet)

Until we wire a button on the settings page, you can invoke the action
from a temporary script or by calling the server action via fetch from
the browser console while logged in as an owner. Easiest path:

1. Open the Telnyx portal → **My Numbers**. Copy the E.164 strings of
   the orphan numbers (the ones whose orders show `success` but that
   are not in `tenant_phone_numbers`).
2. While logged in as the owner of the target tenant, open the browser
   console at any authenticated page and run:

   ```js
   // For each orphan E.164:
   await fetch('/_next/postponed/path-of-server-action', { … })
   ```

   …or simply paste the import into a one-off page component:

   ```tsx
   "use server";
   import { importExistingPhoneNumber } from "@/app/(dashboard)/admin/settings/phone-numbers/actions";
   await importExistingPhoneNumber({ e164: "+1XXXXXXXXXX", label: "Main" });
   ```

   The cleanest path is to add an "Import existing number" form to the
   settings page; that's a follow-up.

## Verification

`tsc --noEmit -p apps/web/tsconfig.json` → clean.

## Files touched

- `apps/web/lib/telnyx/client.ts`
  - Added exported `findPhoneNumberByE164` (resilient lookup).
  - `purchaseNumber` now uses it after order polling and surfaces a
    targeted error pointing operators to the rescue importer when the
    lookup fails.
- `apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts`
  - Imports `findPhoneNumberByE164`.
  - Adds `importExistingPhoneNumber` action.
- `apps/web/lib/telnyx/fetch.ts`
  - Diagnostic logging: `[telnyx-trace] → METHOD /path` on every call
    and `[telnyx] METHOD /path → STATUS` on every 4xx/5xx, with the
    parsed error body. No API-key exposure.
