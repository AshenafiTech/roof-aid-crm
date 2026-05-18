# Step 5 — Phone numbers settings page

**Date:** 2026-04-30
**Stage:** M4 Stage 1.5 — completes the per-tenant numbers feature
**Files added/modified:**
- `apps/web/components/shared/number-picker-form.tsx` — extracted reusable form
- `apps/web/app/onboarding/number-picker.tsx` — refactored to use the shared form
- `apps/web/app/(dashboard)/admin/settings/phone-numbers/page.tsx`
- `apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts`
- `apps/web/app/(dashboard)/admin/settings/phone-numbers/phone-numbers-management.tsx`

## Purpose

Give owners and admins a self-service surface to manage the lifecycle
of their tenant's phone numbers without involving support: buy more
numbers, change labels, set the primary, change routing, release.

This is Step 4's onboarding picker generalized — same Telnyx
purchase flow, more controls.

## Routes

| Route | Role |
|---|---|
| `/admin/settings/phone-numbers` | owner, admin, super_admin |

Anyone else gets `redirect("/")`.

## Server actions

All in `actions.ts`, all gated by `requireOwnerOrAdmin()`:

| Action | Purpose |
|---|---|
| `listPhoneNumbers` | Read all non-released rows (RLS-scoped to tenant) |
| `searchNumbers` | Mirror of onboarding's search (Telnyx `/v2/available_phone_numbers`) |
| `addPhoneNumber` | Buy + attach + insert. Auto-promotes to primary if it's the first active number |
| `updateNumberLabel` | Inline label edit |
| `setPrimaryNumber` | Demote existing primary, promote chosen row — partial-unique index handles intermediate state |
| `updateRoutingRule` | Update `routing_rule` jsonb (`ring_all` / `ring_assigned_then_all` / `voicemail`) |
| `releasePhoneNumber` | Soft-delete (`status='released'`) + Telnyx release; blocks releasing the primary if other actives exist |

## UI behavior

- **List**: each number is its own card with a 3-column grid — number/capabilities/usage on the left, editable label + routing dropdown in the middle, "Set as primary" + ⋯ menu on the right
- **Add**: floating button opens a `Dialog` containing the same `<NumberPickerForm>` used in onboarding — area-code search → results list → label → buy
- **Inline label edit**: a "Save" button appears next to the label input only when the value differs from the saved value (avoids no-op updates)
- **Routing rule**: `<Select>` dropdown, persists immediately on change
- **Set as primary**: only visible on non-primary rows; one click promotes
- **Release**: `⋯ → Release number` opens a confirmation dialog naming the specific number; release is blocked server-side if it's the primary and there are other active numbers (forcing the user to pick a new primary first)

## Reusable component: `NumberPickerForm`

Pulled out of the onboarding picker so the settings page's "Add another"
dialog gets the same UX. It's parametrized by:

- `searchAction` and `purchaseAction` — server-action props that the
  parent supplies (typed signatures so wrong shapes won't compile)
- `submitLabel` (default `"Buy number"`)
- `defaultLabelValue` (`"Main"` for onboarding, `""` for settings)
- `successToast(e164)` — custom success message
- `onSuccess(e164)` — fire after success (close dialog, refresh, etc.)

Onboarding wraps it inside a `Card` with welcome copy. Settings wraps
it inside a `Dialog`. Same component, same UX, two contexts.

## Decisions worth flagging

- **Service-role writes for all mutations.** Auth check happens in the
  action; once we've verified the caller is a tenant owner/admin, the
  admin client (service role) writes through RLS. Mirrors the existing
  pattern in `app/(dashboard)/admin/users/actions.ts`.
- **Routing rule schema preserves the `voicemail_after_seconds` field**
  even though the UI doesn't expose it yet. Default stays at 25s; future
  UI can add a slider without a migration.
- **Releasing the primary is blocked when other actives exist.** The
  server returns a clear error ("Set another number as primary first")
  rather than silently demoting. This matches the principle that
  caller-ID changes are always explicit.
- **Two-step primary swap** (`UPDATE ... SET is_primary=false` then
  `UPDATE ... SET is_primary=true`) is safe because the unique index
  is partial — it only enforces uniqueness when `is_primary=true AND
  status='active'`, so the intermediate "no primary" state is fine.
- **DB-first, Telnyx-second on release.** If the Telnyx call fails after
  we've marked the row `released`, we leave the row released and surface
  the partial-failure to the user — the next dashboard load won't re-
  attempt because the row is already past `status='active'`. Operator
  can re-run via the Telnyx portal.
- **"This month" usage is stubbed** as `12 calls · 47 SMS` per the
  Stage 1.5 spec. Real numbers wire in M5 dashboard.
- **No edit dialog, no row expansion** — every control is inline. With
  ≤10 numbers per tenant in practice, a denser table-like layout would
  add complexity without saving real estate.

## What's intentionally not here

- **Number transfer between tenants** — out of scope, would require
  Telnyx port-out flow.
- **Bulk operations** — release multiple, label multiple — premature
  given typical tenant has 1–3 numbers.
- **Custom voicemail recording upload** — `recording_disclosure_audio_url`
  is reserved on the `tenants` table but UI lands in M7.
- **Per-rep number assignment** — Stage 1.5 scope is per-*office*, not
  per-rep. Per-rep is a Tier-2 paid upgrade in the original blueprint.
- **Settings hub link** — the parent `/admin/settings` page still says
  "Coming in M7"; phone-numbers is reachable by direct URL now. The
  hub gets a proper menu in M7.

## Manual test plan

1. Sign in as an owner who has a primary number from Step 4
2. Visit `/admin/settings/phone-numbers`
3. Verify the primary number is listed with the PRIMARY badge,
   capabilities, label, routing dropdown
4. Edit the label, hit Save — toast + persists on refresh
5. Change routing to "Send to voicemail" — toast + persists
6. Click "Add another number" → dialog opens with picker → buy a 512
   number with label "Bentonville office"
7. Verify the new card appears, **without** the PRIMARY badge
8. Click "Set as primary" on the new row — primary swap happens
9. Click ⋯ → Release on a non-primary row — confirmation dialog appears
10. Confirm — number disappears from the list (status='released')
11. Try releasing the primary while a second number is active — error
    "Set another number as primary first"
12. Sign in as a `telefonista` and visit the URL — redirected to `/`

(Each successful purchase costs ~$1/mo on the Telnyx account; release
afterwards if testing.)

## Next step

**Per-tenant number provisioning is now complete end-to-end.**
Stage 1.5's user-visible surface area is done. Remaining M4 work is
the comms features that *consume* this:

- **M4-5 dispatcher fill-in** — call.* and message.* event handlers in
  the existing `telnyx-webhook` skeleton (Stage 2 + Stage 3 territory)
- **Stage 2** — WebRTC softphone (M4-1 to M4-4)
- **Stage 3** — Web SMS module (M4-6)
- **Stage 4** — Email + SendGrid
- **Stage 5** — DNC + calling hours (single source of truth across all
  call/send sites)

Pick whichever stage to build next based on demo priority.

## References

- [stage-1.5-tenant-phone-numbers.md §6](stage-1.5-tenant-phone-numbers.md)
- [step-4-onboarding-number-picker.md](step-4-onboarding-number-picker.md)
- [step-3-telnyx-client-wrapper.md](step-3-telnyx-client-wrapper.md)
