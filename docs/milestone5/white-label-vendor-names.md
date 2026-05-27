# White-Label Pass — Hide the Phone Vendor from Customers

## Purpose

Customers should experience phone numbers, calling, and SMS as Roof-Aid
features, not as a specific upstream vendor's product. Any string that
gets rendered in the UI or surfaced through a toast was scrubbed so the
brand we white-label (Telnyx) is invisible to end-users.

Internal-only references (file paths, function names, variable names,
column names, server-side log lines, comments, dev docs) were left alone
— they aren't customer-facing and changing them would be churn for no
benefit.

## What changed

### UI labels

| File | Before | After |
|---|---|---|
| [admin/settings/page.tsx:100](../../apps/web/app/(dashboard)/admin/settings/page.tsx#L100) | "set Telnyx extensions" | "set phone extensions" |
| [admin/settings/phone-numbers/phone-numbers-management.tsx:160](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/phone-numbers-management.tsx#L160) | "back to Telnyx and stop billing" | "and stop billing for it" |
| [admin/users/user-management.tsx:500,627](../../apps/web/app/(dashboard)/admin/users/user-management.tsx) | "Telnyx Extension" (form label) | "Phone Extension" |
| [(dashboard)/sdr-activity-chart.tsx:75](../../apps/web/app/(dashboard)/sdr-activity-chart.tsx#L75) | "Call data will populate after Telnyx integration (M4)." | "Call data will populate once calling is set up for your tenant." |

### Error messages that bubble up to toasts

All of these flow through `errorMessage(err)` → `toast.error(...)` on the
customer's screen, so the vendor name had to come out of the `message`
field.

| File | Vendor-leaking message | Generic replacement |
|---|---|---|
| [lib/telnyx/errors.ts](../../apps/web/lib/telnyx/errors.ts) (`PartialPurchaseError`) | "Telnyx number order X reached 'success' but the global phone-number lookup did not resolve…" | "Number X was provisioned but could not be confirmed within the wait window. The number is held by the phone provider…" |
| [lib/telnyx/errors.ts](../../apps/web/lib/telnyx/errors.ts) (`fromTelnyxResponse`) | "Telnyx 500: …" | "Phone service 500: …" |
| [lib/telnyx/client.ts:172](../../apps/web/lib/telnyx/client.ts#L172) | "Telnyx number order completed but returned no assigned number…" | "Number order completed but returned no assigned number…" |
| [lib/telnyx/client.ts:194](../../apps/web/lib/telnyx/client.ts#L194) | "Telnyx number order X failed for Y" | "Could not provision Y. Please try a different number." |
| [lib/telnyx/client.ts:154](../../apps/web/lib/telnyx/client.ts#L154) | "A Telnyx connection … and TELNYX_MESSAGING_PROFILE_ID are required to purchase numbers" | "Calling is not fully configured. Please contact support." |
| [lib/telnyx/client.ts:386](../../apps/web/lib/telnyx/client.ts#L386) | "Telnyx credential response missing sip_username or sip_password" | "Phone service credential response was incomplete. Please try again." |
| [lib/telnyx/client.ts:568](../../apps/web/lib/telnyx/client.ts#L568) | "TELNYX_VOICE_APP_ID must be set to initiate calls" | "Calling is not fully configured. Please contact support." |
| [lib/telnyx/fetch.ts:52](../../apps/web/lib/telnyx/fetch.ts#L52) | "TELNYX_API_KEY is not set in the server environment" | "Phone service is not configured on the server. Please contact support." |
| [lib/telnyx/fetch.ts:115](../../apps/web/lib/telnyx/fetch.ts#L115) | "Telnyx request failed after N attempts: …" | "Phone service request failed after N attempts: …" |
| [lib/telnyx/ensure-tenant-connection.ts:70](../../apps/web/lib/telnyx/ensure-tenant-connection.ts#L70) | "Telnyx connection-create failed: …" | "Phone service connection setup failed: …" |
| [lib/telnyx/ensure-tenant-connection.ts:88](../../apps/web/lib/telnyx/ensure-tenant-connection.ts#L88) | "Connection was created on Telnyx but could not be saved to the tenant record. Contact support and reference connection id X." | "Phone service connection was set up but could not be saved to your account. Please contact support and reference reference id X." |
| [api/telnyx/credentials/route.ts:108](../../apps/web/app/api/telnyx/credentials/route.ts#L108) | `error: "Telnyx: <msg>"` | `error: msg` (prefix stripped — vendor neutral) |
| [admin/settings/phone-numbers/actions.ts:264](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts#L264) | "Telnyx has no owned number matching X. Confirm the E.164 string in the Telnyx portal → My Numbers." | "We don't have a number matching X in inventory. Please contact support to verify." |
| [admin/settings/phone-numbers/actions.ts:302](../../apps/web/app/(dashboard)/admin/settings/phone-numbers/actions.ts#L302) | "Telnyx lookup succeeded but database write failed: …" | "Number located but database write failed: …" |

## What was deliberately NOT changed

These are server-side, dev-only, or otherwise never customer-visible:

- File paths under `lib/telnyx/`, `app/api/telnyx/` — internal modules and
  internal API routes; not displayed in the UI.
- Variable / function names (`telnyxExt`, `purchasedTelnyxId`,
  `telnyxFetch`, `ensureTenantTelnyxConnection`).
- Database column names (`telnyx_credential_connection_id`,
  `telnyx_number_id`, `telnyx_extension`, `telnyx_message_id`) — internal
  schema.
- `console.log` / `console.error` lines in all `[telnyx:*]` /
  `[onboarding:purchase]` / `[telnyx-trace]` prefixes — these go to
  Vercel logs and are an ops-and-debug tool, not user-facing.
- Comments in `lib/telnyx/*` — internal documentation.
- The `@telnyx/webrtc` SDK import in [components/comms/softphone.tsx](../../apps/web/components/comms/softphone.tsx) and its event names (`telnyx.ready`, `telnyx.error`, etc.) — SDK contract.
- Dev docs under `docs/milestone5/` (this file included) — internal
  engineering notes.

## Why "phone service" / "phone provider" as the generic term

Chose "phone service" or "phone provider" over alternatives ("carrier",
"calling system", "the platform") because:

- **Carrier** is technically incorrect — Telnyx is a CPaaS, not a carrier
  in the regulatory sense.
- **The platform** is ambiguous — the customer might think we mean
  Roof-Aid itself, which we don't.
- **Phone service / phone provider** is neutral, accurate, and the
  customer understands it without explanation. Matches how Stripe says
  "your bank" in error messages.

If the vendor ever changes, the user-facing strings need no updating —
they refer to a role, not a brand.

## Verification

```bash
# UI-visible mentions of Telnyx — should return 0 hits in TSX strings
grep -rn 'Telnyx' apps/web/app apps/web/components --include='*.tsx' \
  | grep -v "//\|/\*\|telnyxExt\|TelnyxRTC\|@telnyx"

# User-facing error message strings — should return 0 hits
grep -rn 'Telnyx' apps/web/lib apps/web/app/api --include='*.ts' \
  | grep -E '(message:|error:|throw new Error)' \
  | grep -v 'TelnyxError\|fromTelnyxResponse\|telnyxFetch'
```

Both should return empty after this change.
