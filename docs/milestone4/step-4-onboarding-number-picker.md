# Step 4 — Onboarding number picker

**Date:** 2026-04-30
**Stage:** M4 Stage 1.5 — first user-visible payoff
**Files added/modified:**
- `apps/web/app/onboarding/page.tsx` — server component (replaces stub)
- `apps/web/app/onboarding/number-picker.tsx` — client component
- `apps/web/app/onboarding/actions.ts` — server actions
- `apps/web/lib/supabase/database.types.ts` — regenerated to include 010-013 schema

## Purpose

Wire the Telnyx wrapper from Step 3 into a real flow: a tenant owner
opens `/onboarding`, types an area code, picks a number from a list,
clicks **Buy & continue**, and within ~5 seconds has a working business
line attached to our messaging profile + voice app.

This is the moment Stage 1.5's design becomes real — every later
M4 stage assumes "the tenant has at least one number".

## Files in detail

### `actions.ts` — `searchNumbers` and `purchaseAndAttachNumber`

Both server actions share an auth gate (`requireTenantOwner`) that:
- Resolves the auth user via `createClient()` (cookie-based session)
- Joins to `public.users` for tenant_id + role
- Permits `owner`, `admin`, and `super_admin` only

`searchNumbers({ areaCode })`:
- Validates 3-digit area code via Zod
- Calls `searchAvailableNumbers` from `lib/telnyx/client`
- Returns shaped `AvailableNumber[]` to the client

`purchaseAndAttachNumber({ e164, label })`:
1. Auth check → tenant owner/admin
2. Validate inputs (E.164 + label length) via Zod
3. Use `createAdminClient()` (service role) to:
   - **Reject** if the tenant already has a primary active number —
     buying a second primary would silently overwrite the caller-ID
     contract. Adding *additional* numbers happens from the settings
     page, not onboarding.
4. Call `purchaseNumber` — Telnyx atomically buys + attaches to the
   platform's messaging profile and voice connection
5. Insert the `tenant_phone_numbers` row with `is_primary=true`,
   `status='active'`, `created_by=user.id`
6. **Safety net:** if the DB insert fails AFTER a successful Telnyx
   purchase, immediately call `releaseNumber(telnyxNumberId)` so we
   don't leave a paid-for orphan. If release also fails, log
   "CRITICAL — manual intervention required" with both error messages.
7. `revalidatePath` for `/onboarding` and `/admin/settings/phone-numbers`

### `number-picker.tsx` — client UI

- Numeric area-code input (3 digits, regex-stripped on each keystroke)
- Search button calls `searchNumbers` via `useTransition`
- Results render as a radio list with formatted E.164, city/region,
  capabilities (VOICE / SMS / MMS), and monthly cost
- Default selection = first result
- Label input (default "Main", 50 char cap)
- "Buy & continue" calls `purchaseAndAttachNumber`, surfaces success
  via Sonner toast, refreshes the page on success
- All error paths surface as `toast.error(...)`

UX details:
- Empty results → centered "No numbers in that area code" hint with
  area-code suggestions
- Both Search and Buy buttons spinner via Lucide `Loader2`
- Enter key in area-code field triggers search

### `page.tsx` — server component

- Redirects unauthenticated users to `/login?redirect=/onboarding`
- If no `public.users` row → shows "your account isn't linked to a
  tenant" message (Step 1 needs to complete first)
- If a primary `tenant_phone_numbers` row already exists → green
  confirmation card with the number formatted, label, capabilities,
  and a link to settings for adding more
- Otherwise renders `<NumberPicker />`

## Database types regenerated

Ran `supabase gen types typescript --linked --schema public,graphql_public`
and replaced `apps/web/lib/supabase/database.types.ts`. The new file:
- Includes `tenant_phone_numbers` rows + Insert + Update shapes
- Includes `webhook_events`
- Includes `can_call` and `can_message` RPC signatures
- Adds the new tenant columns (`timezone`, `calling_hours`, etc.)

`tsc --noEmit` runs clean across the whole web app.

## Failure modes handled

| Scenario | What happens |
|---|---|
| Not logged in | Redirect to `/login` |
| No tenant linked | Friendly "step 1 incomplete" card |
| Wrong role (telefonista, rufero) | Server action throws → toast.error |
| Bad area code | Zod validation → toast.error |
| No numbers in area code | Empty-state UI |
| Tenant already has primary | Server action returns `{ ok: false, error: "..." }` |
| Telnyx 5xx / 429 | `fetch.ts` retries 3× with backoff; final failure → toast.error |
| Purchase OK, insert fails | Auto-release attempted; user sees "purchased but DB write failed" |
| Auto-release also fails | Logged as CRITICAL with both error messages; user sees explicit support hint |

## Testing notes

This step needs a running dev server to test end-to-end (no automated
tests here — that's a Step 5+ concern). Manual verification:

```bash
cd apps/web && pnpm dev
# Then sign in as an owner and visit http://localhost:3000/onboarding
```

Expected interactive flow:
1. Land on the picker
2. Type "479" → Search → see 20 Arkansas numbers (~$1.00/mo each)
3. Pick one, leave label as "Main", click "Buy & continue"
4. Within 5 seconds: success toast, page refreshes to show green card
5. Verify in Supabase Studio: `SELECT * FROM tenant_phone_numbers` has
   the new row with `is_primary=true`, correct `messaging_profile_id`
   and `voice_app_id`

⚠️ **Each successful purchase is real money** (~$1/mo on the Telnyx
account). For dev testing, prefer to release the number from the
Telnyx portal or via `releaseNumber` after each test, OR just reuse
one tenant's primary across runs.

## What's intentionally not here

- **Wizard chrome** (steps 1, 3) — Step 1 (business profile) and Step 3
  (calling preferences) are out of scope for M4 Stage 1.5. Onboarding
  page just shows the picker for now; the wizard scaffolding can land
  in a later refactor.
- **`pending_number_releases` cron table** — the original spec
  ([number-provisioning-implementation.md §4](number-provisioning-implementation.md))
  proposes a queued-release safety net. We use **inline release** here
  since: (a) failures should be rare, (b) inline keeps the failure
  story visible to the user, (c) a cron table adds infrastructure for
  a problem we haven't measured yet. Add it later if real-world
  failure-after-purchase becomes a measurable rate.
- **Multiple-numbers UI** — onboarding only supports the first/primary
  number. Adding more happens from the settings page (Step 5).
- **Number-availability re-check before purchase** — there's a small
  TOCTOU window where the number could be bought between search and
  click. Telnyx returns a 400 in that case; the wrapper surfaces it as
  a `TelnyxError` and the user sees the message via toast. They click
  another number and try again.

## Next step

**Step 5 — Phone numbers settings page** at
`/admin/settings/phone-numbers`. Adds:
- Listing all of the tenant's numbers
- Add another number (modal reusing `NumberPicker` logic)
- Edit label
- Set primary
- Routing rule dropdown (ring all / ring assigned then all / voicemail)
- Release number (soft-delete + Telnyx release)

## References

- [stage-1.5-tenant-phone-numbers.md §5–6](stage-1.5-tenant-phone-numbers.md)
- [number-provisioning-implementation.md](number-provisioning-implementation.md)
- [step-3-telnyx-client-wrapper.md](step-3-telnyx-client-wrapper.md)
