# Sidebar Phone & SMS — wired up with live logs

## Purpose

The sidebar's **Phone** and **SMS** entries (under "Tools") rendered
mostly placeholder UI. The phone dialer was already calling Telnyx via
the softphone store, but the SMS composer's send button did nothing,
and neither page surfaced the tenant's communication history.

This change makes both pages functional:

- **SMS** — the composer now actually sends through Telnyx, attaching
  the message to a matching prospect on the tenant when one exists.
- **Phone** and **SMS** — each page now renders a live, realtime list
  of recent calls / messages for the tenant.

## Steps taken

### 1. Added log-listing queries

`apps/web/lib/queries/comms.ts` (new):

- `listCallLogs(tenantId, { limit })` — recent calls with prospect +
  agent joined.
- `listSmsLogs(tenantId, { limit })` — recent messages with prospect +
  agent joined.

Selects ordered by `started_at DESC NULLS LAST, created_at DESC` for
calls (matches the index from migration `016_call_logs_lifecycle.sql`)
and `created_at DESC` for SMS.

### 2. Added an ad-hoc SMS server action

`apps/web/lib/sms/adhoc-actions.ts` (new):

The existing `sendSms` server action requires a `prospectId`. The /sms
page lets a rep type any phone number, so this new action:

1. Normalizes the input to E.164 (same rules as the dialer).
2. Looks up a prospect on the tenant whose `phones` array contains
   the number; if found, the message is attached to that prospect's
   thread (so it appears on the prospect detail page).
3. If matched, runs the same `can_message` RPC gate the prospect-flow
   uses. DNC is a soft-warning that requires `acknowledgedDnc`;
   everything else is a hard block.
4. Picks an outbound number with `pickOutboundNumber`, inserts the
   `sms_logs` row as `queued`, calls Telnyx, and updates to `sent`
   (or `failed`).

### 3. Live realtime logs lists

`apps/web/app/(dashboard)/phone/call-logs-list.tsx` and
`apps/web/app/(dashboard)/sms/sms-logs-list.tsx` (new client components).

Both subscribe to `postgres_changes` on `call_logs` / `sms_logs`
filtered by `tenant_id`. On any insert/update they refetch the
touched row with prospect+agent joined and merge it into the list;
deletes drop the row. Realtime is already enabled on both tables
(migrations 014 and 016).

UI:

- Direction-aware avatar (outbound vs. inbound).
- Prospect name links to `/prospects/:id` when matched.
- Calls show disposition badge, duration, agent, and a recording link
  when `recording_url` is set.
- SMS show status icon (queued / sent / delivered / unconfirmed /
  failed), body preview, and any error code.

### 4. Pages

- `apps/web/app/(dashboard)/phone/page.tsx` — server component now
  loads `listCallLogs` and renders `<CallLogsList />` below the
  dialer.
- `apps/web/app/(dashboard)/sms/page.tsx` — server component loads
  `listSmsLogs` and renders the composer alongside `<SmsLogsList />`.
- `apps/web/app/(dashboard)/sms/sms-composer.tsx` — replaced the
  placeholder send button with a real `useTransition`-based send
  flow that calls `sendAdHocSms`, surfaces toast errors, and opens
  the existing `DncConfirmDialog` when the matched prospect is on
  DNC.

## Notes / decisions

- Phone-side calling was already functional (the dialer uses
  `useSoftphoneStore`). No changes to the dialer itself — only the
  call-history panel was added.
- The ad-hoc send path deliberately does **not** gate on DNC when no
  prospect matches the destination number. DNC is per-tenant and
  enforced via `can_message` against a prospect; for an unknown
  destination there's no prospect to gate against. Adding a free
  `dnc_records` lookup here would duplicate the prospect-side check
  and is out of scope for this task.
- Lists cap at 50 rows server-side and 100 in-memory (after realtime
  inserts) to keep DOM size bounded.

## Files changed

```
apps/web/app/(dashboard)/phone/page.tsx              (modified)
apps/web/app/(dashboard)/phone/call-logs-list.tsx    (new)
apps/web/app/(dashboard)/sms/page.tsx                (modified)
apps/web/app/(dashboard)/sms/sms-composer.tsx        (rewritten)
apps/web/app/(dashboard)/sms/sms-logs-list.tsx       (new)
apps/web/lib/queries/comms.ts                        (new)
apps/web/lib/sms/adhoc-actions.ts                    (new)
```

## Verification

- `pnpm --filter web exec tsc --noEmit` passes with no errors.
- The /phone page already had a working dialer; the new logs list
  subscribes to realtime and updates as the existing call webhook
  processes lifecycle events.
- The /sms page now actually sends; success rows flip from `queued`
  → `sent` → `delivered` (or `failed`) via the existing reconcile
  trigger in migration `017_sms_logs_status_reconcile.sql`.
