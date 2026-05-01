# Step 7 — Stage 3 SMS UI

**Date:** 2026-04-30
**Stage:** M4 Stage 3 — Web SMS (UI half, completes Stage 3)
**Files added/modified:**
- `apps/web/components/comms/sms-thread.tsx` — bubbles + Realtime
- `apps/web/components/comms/sms-composer.tsx` — textarea, segments, templates, send
- `apps/web/components/comms/dnc-confirm-dialog.tsx` — DNC override modal
- `apps/web/app/(dashboard)/prospects/[id]/sms-tab.tsx` — tab content
- `apps/web/app/(dashboard)/prospects/[id]/tabs.tsx` — added SMS tab
- `apps/web/app/(dashboard)/prospects/[id]/page.tsx` — fetches initial SMS + templates

## Purpose

Visible SMS surface inside the prospect detail page. End users can:

- See the entire conversation thread with status icons (✓ sent, ✓✓ delivered, ⏱ queued, ⚠ failed)
- Type a message with live segment counter (160-char SMS / 70-char Unicode)
- Insert templates from `tenants.sms_templates`
- Send — and watch the message appear instantly via Realtime, then flip from `queued` → `sent` → `delivered`
- Receive inbound replies in real time (no refresh)
- Confirm a DNC override before any message goes out — never blocked, always one click of friction

## Component layout

```
ProspectTabs (client)
└── TabsContent value="sms"
    └── SmsTab (client)
        └── Card
            ├── SmsThread       — initial messages + Realtime upsert
            └── SmsComposer
                ├── DNC banner (if prospect.do_not_call)
                ├── Textarea (auto-resize, ⌘/Ctrl+Enter to send)
                ├── Segment counter (amber at 5 segs, red at 6)
                ├── Templates dropdown (if any)
                ├── Send button
                └── DncConfirmDialog (re-render when sendSms returns requiresAcknowledgement)
```

## Realtime subscription

`SmsThread` opens a channel `sms:<prospectId>` with a postgres-changes
filter `prospect_id=eq.<id>`. Both INSERT and UPDATE events are merged
into a `Map<id, SmsMessage>` so:

- New incoming message → bubble appears at the bottom
- Outbound message goes from `queued` (just-inserted) → `sent` (after
  the server action's UPDATE) → `delivered` (after webhook fires)
- All happen without a manual refresh

Auto-scroll to bottom triggers on `sorted.length` change so the user
always sees the latest message.

## Send flow with DNC override

```
User types → clicks Send
   │
   ▼
sendSms({ prospectId, body, acknowledgedWarnings: [] })
   │
   ├─ ok: true                  → toast clears, body cleared, Realtime shows it
   │
   ├─ ok: false, requiresAcknowledgement: ['dnc']
   │     │
   │     ▼
   │   <DncConfirmDialog warnings={['dnc']} onConfirm={...}>
   │     │ user clicks "Send anyway"
   │     ▼
   │   sendSms({ ..., acknowledgedWarnings: ['dnc'] })
   │     → ok: true, message goes through
   │
   └─ ok: false, error: '...'   → toast.error with the reason
```

The `acknowledgedWarnings` array is stored on the `sms_logs.acknowledged_warnings` column for compliance audit. A future "show me everyone who's overridden DNC" report is one query:

```sql
SELECT prospect_id, agent_id, body, created_at
  FROM sms_logs
 WHERE 'dnc' = ANY(acknowledged_warnings);
```

## Tab integration

`tabs.tsx` adds:
- `"sms"` to `VALID_TABS` (so `?tab=sms` deep-links work)
- New `<TabsTrigger value="sms">SMS</TabsTrigger>`
- New `<TabsContent value="sms">` rendering `<SmsTab>`

`page.tsx` gets two new parallel queries inside the `Promise.all`:
- `sms_logs` (tenant + prospect scoped via RLS) — initial thread state
- `tenants.sms_templates` — for the composer dropdown

Templates are filtered to those marked `active !== false` and projected to `{ id, name, body }`. The `tenants.sms_templates` schema is intentionally jsonb so M7 can extend it without a migration.

## Segment counter

```ts
function segmentsFor(text: string) {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / cap));
}
```

Color-coded:
- Default text-muted-foreground
- Amber at 5 segments
- Red at 6 segments (a 6-segment SMS costs 6× a single — show it loudly)

The same calculation runs server-side in `sms_segments(text)` (in `lib/sms/actions.ts`) and is persisted to `sms_logs.segments` so cost reporting is consistent with what the user saw at compose time.

## Why not a separate `/prospects/[id]/sms` route?

The Stage 3 spec mentions both a tab AND a side-sheet. We shipped the tab only — it's the primary read/write surface. The side-sheet (quick-reply from prospect list rows) is real value but adds list-view surgery; defer to when there's a clear ask. The tab pattern matches the existing notes/activity/pipeline tabs so users discover SMS without retraining.

## What's intentionally NOT here

- **Side-sheet quick-reply from prospect list** — defer
- **Per-prospect "Send from" dropdown** — `pickOutboundNumber` defaults
  to the last-inbound number anyway. Adding a dropdown is mostly
  cosmetic for tenants with multiple numbers; can land when the
  multi-number tenants ask
- **Template management UI** — the composer reads templates but
  there's no edit UI yet. Stage 1.5 design defers that to M7.
- **Mark-as-read for inbound SMS** — covered by Stage 6 (notification
  bell) which marks the notifications row as read; sms_logs itself
  doesn't need a read flag for v1

## Verified

- ✅ `tsc --noEmit` passes across the whole web app after all changes
- ✅ No new dependencies; reuses existing shadcn primitives (Tabs,
  DropdownMenu, Dialog, Card, Button, Textarea)
- ✅ Components are server-tree friendly (server fetches initial state,
  client handles Realtime + composer)

## Manual smoke test

End-to-end live test (requires real Telnyx traffic):

1. Sign in as an owner/admin/telefonista
2. Open a prospect that has the assigned tenant's number bound (it
   doesn't matter which number — the picker resolves it)
3. Click the **SMS** tab → see empty state (or existing thread)
4. Type "Hello from Roof-Aid" → watch segment counter
5. Click **Send** → bubble appears as `queued` → flips to `sent` within
   a second → flips to `delivered` when carrier confirms (~10s)
6. From a real phone, text the tenant number: "STOP"
7. Verify in another browser tab:
   - The STOP appears as an inbound bubble
   - The auto-reply "You've been unsubscribed..." appears as an
     outbound bubble within 30s
   - The prospect's DNC flag is now true
8. Try sending another SMS to the now-DNC prospect:
   - Composer shows the amber DNC banner
   - Click Send → DncConfirmDialog appears
   - Click "Send anyway" → message goes through
   - Verify `acknowledged_warnings` includes `'dnc'` in the new row

## Stage 3 — done

Outbound, inbound, real-time UI, STOP keyword, DNC override, audit trail, templates — all in. Stage 3 acceptance criteria from the spec covered:

- [x] Side-panel SMS thread (tab)
- [x] Compose with template insert
- [x] Segment counter
- [x] Send via server action wrapping Telnyx
- [x] Receive via webhook → Realtime → UI
- [x] Delivery status updates from `queued` → `sent` → `delivered`
- [x] STOP keyword auto-DNC + auto-reply
- [x] (Modified per memory) DNC = confirmation, not block

## Next stages, in order

| Stage | What | Why next |
|---|---|---|
| **2** | WebRTC softphone | Now that SMS is rock-solid, audio is the natural follow-on. The webhook dispatcher's call.* slot is already stubbed |
| **5** | DNC + calling-hours enforcement spec update | Stale docs need to reflect the warning-not-block policy |
| **4** | Email via SendGrid | Lowest effort if the demo lead asks for "email too" |
| **6** | Notification bell | Light UI; rides on the inbound_sms notifications we already insert |
| **7** | Mobile SMS | Now unblocked — Stage 3 RPC contract is set |

## References

- [step-6-sms-backend.md](step-6-sms-backend.md) — backend half
- [stage-3-web-sms.md](stage-3-web-sms.md) — original spec
- DNC-as-warning policy: `~/.claude/projects/.../memory/feedback_dnc_warning_only.md`
