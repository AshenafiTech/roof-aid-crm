# Stage 5 — DNC + Calling-Hours Enforcement

**Goal:** Make `can_call()` and `can_message()` (built in Stage 1) the only path to a phone or SMS, on every surface, web and mobile. Wire calling-hours editing into tenant settings. Verify that no code path can bypass DNC.

**Outcome:** Zero TCPA exposure. Even an admin clicking "Call" on a flagged prospect at 11pm gets blocked at the database, not the UI.

**Estimated time:** 1 day

---

## 1. Why this is its own stage

Stages 2–4 each ship their UI with the `can_*()` checks wired in for the happy path. Stage 5 is the **audit pass**: walk every code path that could initiate a call, send an SMS, or place a request to Telnyx, and confirm it goes through the RPC. Catch the dead-code paths (e.g. dev-only debug routes) before launch.

---

## 2. Inventory: every place a call/SMS can start

Run this audit during stage kickoff. Update the table as code is reviewed.

| Path | File | Calls `can_call`? | Calls `can_message`? | Status |
|------|------|-------------------|----------------------|--------|
| Prospect card → Call button | `components/prospects/call-button.tsx` | yes | — | wired Stage 2 |
| Side panel → Call | `components/prospects/side-panel-actions.tsx` | yes | — | wired Stage 2 |
| Profile bar → Call | `components/prospects/profile-action-bar.tsx` | yes | — | wired Stage 2 |
| Click-to-call from notification deep-link | `lib/router/deep-link.ts` | TBD | — | **audit needed** |
| `/api/calls/dial` (admin debug) | `app/api/calls/dial/route.ts` | TBD | — | **audit needed** |
| Prospect card → SMS button | `components/prospects/sms-button.tsx` | — | yes | wired Stage 3 |
| `send_sms` RPC | DB | — | yes (inside RPC) | wired Stage 1 |
| Mobile prospect → tel: hand-off | `quick_actions_bar.dart` | client-only check | — | needs Stage 5 wiring |
| Mobile prospect → SMS reply | (Stage 7 work) | — | yes (via RPC) | Stage 7 |

The DB RPC is already the bottom line — `send_sms` always calls `can_message` itself. But the **UI must also reflect the verdict** so disabled-button states are accurate. Don't rely on errors-on-submit.

---

## 3. Calling-hours admin UI

`app/(dashboard)/admin/settings/calling-hours/page.tsx` — owner / admin only.

UI: 7 rows, one per day of week. Each row:
- Toggle "calls allowed today" (checked/unchecked)
- Two `<input type="time">` for start / end if checked
- Below: "Times are interpreted in your tenant's timezone: **America/Chicago** (change in General Settings)"

Save calls a server action that updates `tenants.calling_hours`. No migration needed — the column is JSONB.

```ts
// apps/web/app/(dashboard)/admin/settings/calling-hours/actions.ts
'use server';

const callingHoursSchema = z.object({
  mon: z.union([z.object({start: z.string(), end: z.string()}), z.null()]),
  // ... tue–sun
});

export async function updateCallingHours(input: unknown) {
  const parsed = callingHoursSchema.parse(input);
  await requireRole(['owner', 'admin']);
  const supa = await createServerClient();
  await supa.from('tenants').update({ calling_hours: parsed }).eq('id', tenantId);
  revalidatePath('/admin/settings/calling-hours');
}
```

---

## 4. Tooltip copy: get this right

Disabled buttons should *explain why*. Single source of truth in `lib/comms/disabled-reason.ts`:

```ts
export function reasonToTooltip(reason: string, ctx?: { hours?: { start: string; end: string }; tz?: string }) {
  switch (reason) {
    case 'dnc':
      return 'DNC flagged — call blocked';
    case 'no_phone':
      return 'No phone number on file';
    case 'outside_calling_hours':
      return ctx?.hours
        ? `Outside calling hours (${ctx.hours.start}–${ctx.hours.end} ${ctx.tz ?? 'local'})`
        : 'Outside calling hours';
    case 'cross_tenant':
      return 'Permission denied';
    case 'not_found':
      return 'Prospect not found';
    default:
      return 'Unavailable';
  }
}
```

The verdict object grows to include the tenant's hours so the UI can render the exact range. Update `can_call()` to include `today_hours`:

```sql
-- inside can_call, on the rejection path:
RETURN jsonb_build_object(
  'allowed', false, 'reason', 'outside_calling_hours',
  'today_hours', v_today, 'tz', v_tz
);
```

---

## 5. Mobile changes

The Flutter app uses `tel:` and `sms:` URI hand-offs (decided in M3 to avoid CallKit work). The DNC/hours check still applies — call the RPC before the hand-off.

`apps/mobile/lib/features/prospects/presentation/widgets/quick_actions_bar.dart`:

```dart
Future<void> _onCallTap() async {
  final res = await Supabase.instance.client.rpc('can_call', params: {
    'p_prospect_id': prospect.id,
  });
  if (res['allowed'] != true) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(_reasonToCopy(res['reason'])),
    ));
    return;
  }
  await _dial(context, prospect.primaryPhone!);
}
```

The Call / SMS / Navigate row of buttons should also fetch `can_call` / `can_message` verdicts on detail-page mount and reflect the disabled state in the button tint, mirroring the web treatment. Keep platform behavior consistent: if a Telefonista on web sees a button disabled, the Rufero on mobile sees it disabled too.

---

## 6. The verification matrix

Run through this matrix manually before signing off Stage 5.

| Setup | Expected when clicking Call | Expected when clicking SMS |
|-------|------------------------------|----------------------------|
| Default prospect, business hours | Dials | Sends |
| `do_not_call = true` | Disabled, tooltip "DNC flagged…" | Disabled, tooltip "DNC flagged…" |
| `phones = '{}'` | Disabled, "No phone number on file" | Disabled, same |
| Tenant `calling_hours.tue = null`, today is Tuesday | Disabled, "Outside calling hours" | **Allowed** (SMS quiet hours not enforced at RPC; carrier handles) |
| Tenant calling hours `08:00-20:00`, server time is 21:00 local | Disabled, "Outside calling hours (08:00–20:00 America/Chicago)" | Allowed |
| Cross-tenant access (Tenant A user querying Tenant B prospect via direct UUID) | Disabled, "Permission denied" | Disabled, same |

For each row: try web (Telefonista), then mobile (Rufero). Both must agree.

---

## 7. Audit script

`scripts/dnc-audit.ts` — one-off node script that scans `call_logs` for any DNC violations after the fact. Runs at end of Stage 5 + scheduled weekly post-launch.

```ts
const violations = await admin
  .from('call_logs')
  .select('id, prospect_id, started_at, prospects!inner(do_not_call, do_not_call_set_at)')
  .eq('direction', 'outbound')
  .filter('prospects.do_not_call_set_at', 'lt', 'started_at')  // DNC was set BEFORE the call
  .filter('prospects.do_not_call', 'eq', true);

if (violations.data?.length) {
  console.error(`DNC VIOLATIONS DETECTED: ${violations.data.length}`);
  process.exit(1);
}
```

A passing run is part of the M4 sign-off.

---

## 8. Acceptance checks

- [ ] Inventory table from §2 is fully audited and every dial/send path goes through `can_*` RPC
- [ ] Calling-hours admin page works end-to-end: edit hours → save → re-load → buttons reflect new hours within one Realtime tick
- [ ] Tooltip copy is consistent across web + mobile (single helper)
- [ ] DNC audit script runs clean
- [ ] Manual matrix from §6 all green for both surfaces
- [ ] Cross-tenant attack: as Tenant A's user, force-call `can_call('<Tenant B prospect uuid>')` directly via the Supabase JS client → returns `{allowed: false, reason: 'cross_tenant'}`

---

## 9. Notes & gotchas

- **Race condition**: agent stares at the prospect at 7:59pm, the cutoff is 8pm, agent clicks Call at 8:00:01pm. The button was rendered as enabled (verdict cached at 7:59), but the dial fails RPC at 8:00. Show a fresh toast: "Call window just ended — try again tomorrow." Don't silently fail.
- **Polling vs Realtime for hour changes**: when a tenant changes their hours, every connected client should re-evaluate. Subscribe to `tenants` Realtime channel filtered by the user's tenant; on update, invalidate the can_call cache.
- **Daylight saving time**: `now() AT TIME ZONE v_tz` handles DST automatically. Don't try to do this in JS.
- **Holidays**: not in scope for v1. M7 adds `tenants.holidays JSONB[]` and integrates into `can_call`.
- **Per-prospect timezone**: deferred to M-future. v1 is tenant-only.
