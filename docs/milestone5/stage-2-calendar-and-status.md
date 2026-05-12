# Stage 2 — Calendar Views + Appointment Status Management

**Goal:** A real calendar UI at `/appointments` with Month / Week / Day views, color-coded by status, filterable by rufero. Clicking any event opens a side drawer where the right role can Confirm, Cancel (with reason), Complete, No-show, or Reschedule. Reschedule creates a new row that points back to the old one; cancelled / no-show / rescheduled rows release their slots so the Stage 1 `EXCLUDE` constraint stops blocking them.

**Outcome:** Telefonistas can see the whole day at a glance. Admins can fix mistakes. Ruferos can mark their own outcomes. Status transitions are role-gated and audit-logged.

**Estimated time:** 2 days

---

## 1. Why this stage matters

A calendar isn't just a viewer — it's the **operational dashboard** for the field team. Two things break a CRM without it:

1. The Telefonista can't see "what's already booked" before scheduling. They schedule blind, then the `EXCLUDE` constraint fires, and they curse the app.
2. Ruferos finish an inspection at 3pm but the appointment shows `pending` in everyone's view until the Telefonista chases them by phone the next morning.

Stage 2 closes both gaps.

---

## 2. Database changes

Stage 1 added the schema. Stage 2 adds **only** an `appointment_status_history` log (the existing `activities` table is fine for an audit trail, but a per-appointment view is easier to query for the side drawer).

```sql
-- 0XX_m5_appointment_status_history.sql

CREATE TABLE appointment_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  reason          text,
  actor_id        uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX appointment_status_history_appointment_idx
  ON appointment_status_history (appointment_id, created_at DESC);

ALTER TABLE appointment_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_status_history_select_tenant
  ON appointment_status_history FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY appointment_status_history_insert_tenant
  ON appointment_status_history FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
```

Trigger to populate it from any status update on `appointments`:

```sql
CREATE OR REPLACE FUNCTION log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO appointment_status_history (
      tenant_id, appointment_id, from_status, to_status, reason, actor_id
    ) VALUES (
      NEW.tenant_id, NEW.id, OLD.status, NEW.status,
      NEW.cancellation_reason,        -- reused for cancel/no-show notes; nullable
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_status_change_log
  AFTER UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION log_appointment_status_change();
```

Status transition validation lives in the **server action**, not the DB. A CHECK constraint would make migrations painful; the action is the gate.

---

## 3. Allowed status transitions

| From      | To           | Allowed roles            | Side effects |
|-----------|--------------|--------------------------|--------------|
| pending   | confirmed    | telefonista, admin, owner | SMS to homeowner: "Confirmed for {time}" |
| pending   | cancelled    | telefonista, admin, owner | Prospect status → `prospects` (back to previous) |
| confirmed | cancelled    | telefonista, admin, owner | SMS: "Your inspection has been cancelled" |
| confirmed | completed    | rufero, admin, owner      | Prospect status → `inspected` |
| confirmed | no_show      | rufero, admin, owner      | Prospect status → `prospects` |
| pending   | rescheduled  | telefonista, admin, owner | Creates new row via Stage 1 modal; old row gets `status='rescheduled'` |
| confirmed | rescheduled  | telefonista, admin, owner | Same |

Terminal states: `completed`, `no_show`, `cancelled`, `rescheduled` — no further transitions.

> The "reschedule" flow is **not** an update of the existing row's `scheduled_at`. It's a new appointment with `rescheduled_from = old.id` and the old row stays for audit. This keeps the EXCLUDE constraint happy (the old row's `status='rescheduled'` is in the partial-WHERE exclusion list).

---

## 4. Web — calendar page

### 4.1 Route

[apps/web/app/(dashboard)/appointments/page.tsx](../../apps/web/app/(dashboard)/appointments/page.tsx) — a server component for initial data fetch, then a client component (`<CalendarView />`) for view-switching and interactivity.

URL params drive everything (deep-linkable):
- `?view=month|week|day` (default: week)
- `?date=YYYY-MM-DD` (default: today)
- `?rufero=<uuid>|all` (default: all for admin/owner/telefonista; rufero's own id for rufero role)

### 4.2 Library choice

Use [**FullCalendar**](https://fullcalendar.io/) (`@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/timegrid` + `@fullcalendar/interaction`). Reasons:

- 3 view modes (`dayGridMonth`, `timeGridWeek`, `timeGridDay`) ship out of the box.
- Battle-tested for hour-grid rendering at scale.
- Resource view (rufero columns side-by-side) available for free if we want it in M7.
- License: MIT for the core packages we need; no per-developer fee.

Alternatives considered:
- **react-big-calendar** — works, but month view truncates badly and customization for status colors is painful.
- **Hand-rolled** — 3+ days of work to match FullCalendar's polish. Not worth it.

### 4.3 Component skeleton

```tsx
// apps/web/components/appointments/calendar-view.tsx
'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending:     '#9CA3AF', // gray-400
  confirmed:   '#2563EB', // blue-600
  completed:   '#16A34A', // green-600
  cancelled:   '#DC2626', // red-600
  no_show:     '#EA580C', // orange-600
  rescheduled: '#7C3AED', // violet-600
};

export function CalendarView({ initialEvents, ruferos }: Props) {
  // ...read view/date/rufero from search params
  // ...subscribe to realtime changes on `appointments` (already wired in M2's pattern)

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView={mapViewParam(view)}      // 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
      initialDate={dateParam}
      events={events.map(a => ({
        id: a.id,
        title: a.prospect_name,
        start: a.scheduled_at,
        end: a.end_at,                       // scheduled_at + duration
        backgroundColor: STATUS_COLORS[a.status],
        borderColor: STATUS_COLORS[a.status],
        extendedProps: a,                    // full appointment object for the drawer
      }))}
      eventClick={(info) => openDrawer(info.event.extendedProps as Appointment)}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      height="calc(100vh - 180px)"
      nowIndicator
      slotMinTime="06:00:00"
      slotMaxTime="22:00:00"
      // ...
    />
  );
}
```

### 4.4 Filter bar

Above the calendar:
- Rufero `Select` — populated from the same `tenant_users` query the M2 prospects-list uses; `All ruferos` first.
- (Future M7) Service area `Select`, status multi-select.

Rufero role sees a disabled `Select` set to themselves — they only see their own appointments. This is RLS-backed (already in place), but the UI doesn't show them the picker either.

### 4.5 Realtime

Reuse the M2 realtime pattern — a `useEffect` subscribes to `postgres_changes` on the `appointments` table for the current tenant, scoped to the visible date range, and calls `router.refresh()` on change. Don't try to mutate the FullCalendar event store directly; let RSC re-render the props.

---

## 5. Side drawer — appointment detail

`<AppointmentDrawer />` opens from `eventClick`. Lives in [apps/web/components/appointments/appointment-drawer.tsx](../../apps/web/components/appointments/appointment-drawer.tsx).

### 5.1 Sections

1. **Header** — prospect name (link to detail), status badge, `Created by X on Y` line.
2. **When** — date, time, duration, "in 4 hours" relative timestamp.
3. **Where** — prospect address + Google Maps link (uses M3's geocoding).
4. **Who** — assigned rufero, distance from their `home_base_coords`.
5. **Notes** — editable textarea (admin/owner/telefonista; rufero read-only).
6. **History** — list of `appointment_status_history` rows for this appointment.
7. **Actions** — role-gated buttons (Stage 2's main attraction).

### 5.2 Action buttons (role-gated)

```tsx
// pseudocode for the actions section
function ActionsRow({ appointment, role }: Props) {
  const can = canTransition(appointment.status, role);

  return (
    <>
      {can.confirm    && <Button onClick={() => confirm(appointment.id)}>Confirm</Button>}
      {can.cancel     && <Button variant="destructive" onClick={() => openCancelModal()}>Cancel</Button>}
      {can.complete   && <Button onClick={() => markComplete(appointment.id)}>Mark complete</Button>}
      {can.noShow     && <Button variant="warning" onClick={() => openNoShowModal()}>No-show</Button>}
      {can.reschedule && <Button variant="secondary" onClick={() => openRescheduleFlow()}>Reschedule</Button>}
    </>
  );
}
```

Cancel and No-show both require a free-text reason (saved to `appointments.cancellation_reason` for both — the column doubles for both outcomes). The modal blocks until the reason is non-empty.

Reschedule opens Stage 1's `SchedulerModal` pre-filled with the existing prospect + duration. On save:
1. New appointment created (Stage 1's normal flow).
2. The old row updated to `status='rescheduled'` (releases the EXCLUDE slot).
3. New row's `rescheduled_from` = old row's id.

This is **one server action**, not three round-trips. Wrap in a transaction.

### 5.3 Server action shape

```ts
// apps/web/app/actions/appointments.ts (additions)

export async function transitionAppointment(input: {
  appointmentId: string;
  to: AppointmentStatus;
  reason?: string;
}): Promise<Result<void>> {
  const supabase = await createServerClient();
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, prospect:prospects(id, status)')
    .eq('id', input.appointmentId)
    .single();

  if (!appointment) return { error: { code: 'not_found' } };

  const role = (await getUserRole());
  if (!isTransitionAllowed(appointment.status, input.to, role)) {
    return { error: { code: 'forbidden', message: 'Not allowed for your role' } };
  }

  if ((input.to === 'cancelled' || input.to === 'no_show') && !input.reason?.trim()) {
    return { error: { code: 'reason_required' } };
  }

  // Update appointment.
  const { error } = await supabase
    .from('appointments')
    .update({
      status: input.to,
      cancellation_reason: input.reason ?? null,
    })
    .eq('id', input.appointmentId);
  if (error) return { error: { code: 'db_error', message: error.message } };

  // Side effect: prospect status flip.
  await maybeUpdateProspectStatus(appointment.prospect.id, input.to);

  revalidatePath('/appointments');
  revalidatePath(`/prospects/${appointment.prospect.id}`);
  return { data: undefined };
}
```

`isTransitionAllowed` is a static table lookup matching the §3 transitions matrix.

---

## 6. Mobile — list view of own appointments

Stage 2 also ships the mobile "My Schedule" list (not full calendar — that lands in M6). Ruferos need to see their day before Stage 7 ships the inspection screen.

### 6.1 Feature folder

Following the prospects-module pattern from M2:

```
apps/mobile/lib/features/appointments/
├── domain/
│   ├── entities/
│   │   └── appointment_entity.dart
│   ├── repositories/
│   │   └── appointment_repository.dart
│   └── usecases/
│       ├── get_my_appointments.dart
│       └── watch_my_appointments.dart
├── data/
│   ├── models/
│   │   └── appointment_model.dart
│   ├── datasources/
│   │   └── appointment_remote_datasource.dart
│   └── repositories/
│       └── appointment_repository_impl.dart
└── presentation/
    ├── bloc/
    │   ├── appointments_bloc.dart
    │   ├── appointments_event.dart
    │   └── appointments_state.dart
    ├── pages/
    │   └── my_schedule_page.dart
    └── widgets/
        └── appointment_card.dart
```

Reuse the auth-module conventions: `dartz` Either, abstract datasource + impl, sealed events/states, Supabase `.stream()` (or the polling-augmented variant the prospects module ended up using).

### 6.2 Query

```dart
// In AppointmentRemoteDatasource:
Future<List<AppointmentModel>> fetchMine() async {
  final userId = client.auth.currentUser!.id;
  final response = await client
    .from('appointments')
    .select('*, prospect:prospects(id, name, address, city, phones)')
    .eq('rufero_id', userId)
    .gte('scheduled_at', DateTime.now().toIso8601String())
    .order('scheduled_at', ascending: true);

  return (response as List).map((r) => AppointmentModel.fromMap(r)).toList();
}
```

### 6.3 UI

A grouped list — sections by day (`Today`, `Tomorrow`, day of week). Each `AppointmentCard` shows:
- Time (left, big)
- Prospect name + address
- Status badge (matching web colors via shared `apps/mobile/lib/core/constants/appointment_status.dart`)
- "Navigate" button (M3 maps deep-link)
- "Call homeowner" button (existing M4 dial intent)

Tap a card → navigate to **AppointmentDetailPage** (lighter than web's drawer; just the action buttons for `Mark complete` / `No-show`).

### 6.4 Status actions on mobile

Rufero can only:
- `confirmed → completed` (button: **Mark complete** — opens Stage 7's inspection flow first, then sets the status on completion)
- `confirmed → no_show` (button: **No-show** — requires reason text input)

Both go through the same `transitionAppointment` Supabase RPC the web uses. M5 doesn't add new mobile RPCs; it's the same server contract.

---

## 7. Acceptance criteria

### Web
- [ ] `/appointments` renders the current week by default
- [ ] Switching to Month / Day updates the URL and persists across refresh
- [ ] Rufero filter applies immediately, no full-page reload
- [ ] Color coding matches §4.3 constants
- [ ] Clicking an event opens the side drawer with prospect link + status history
- [ ] Confirm button is hidden for ruferos; visible for telefonista/admin/owner on pending appointments
- [ ] Cancel modal blocks save until reason is non-empty
- [ ] Reschedule opens Stage 1's scheduler pre-filled; on save, the old row is `rescheduled`, the new row has `rescheduled_from` set
- [ ] Status change triggers a `postgres_changes` event; the calendar updates without a manual refresh
- [ ] Status history shows every transition with actor + timestamp + reason

### Mobile
- [ ] Rufero opens "My Schedule" → sees today's + upcoming appointments grouped by day
- [ ] Tap **Mark complete** → opens inspection flow (Stage 7 placeholder for now) → on save, status → `completed`
- [ ] Tap **No-show** → reason input → submit → status → `no_show`
- [ ] Cancelled appointments don't show up in the rufero's list (filter)

### Cross-cutting
- [ ] `appointment_status_history` rows match every status transition
- [ ] Reschedule frees the old slot — verified by trying to book a new appointment at the same time after rescheduling
- [ ] RLS: rufero account querying `appointments` for another rufero's id → 0 rows
- [ ] Role-transition matrix verified: rufero can't cancel; telefonista can't complete; admin can do both

---

## 8. Pitfalls to avoid

- **Don't** treat reschedule as an update to `scheduled_at`. The EXCLUDE constraint will fight you and you'll lose the audit trail.
- **Don't** mutate the FullCalendar event store from the realtime subscription. Re-render via `router.refresh()` — much simpler.
- **Don't** put status colors in 3 places. One constants file consumed by web + mobile. The mobile-app's prospect-status constants are the pattern.
- **Don't** allow Cancel without a reason. The audit trail is worthless without it, and the column is already there.
- **Don't** flip the prospect status on every appointment change. Only certain transitions update the prospect (see §3 side-effects column). E.g., cancelling a single appointment doesn't change a prospect who has another upcoming one.
- **Don't** show the side drawer's history list lazily — it's small. Load with the rest of the appointment data.
- **Don't** show the "Confirm" button next to "Cancel" without spacing — Telefonistas mis-tap. Use a divider or color contrast.

---

## 9. What ships at end of Stage 2

- 1 migration: `appointment_status_history` table + trigger
- 1 calendar page route + view component (FullCalendar)
- 1 side drawer with role-gated actions
- 1 `transitionAppointment` server action
- 1 helper module: `isTransitionAllowed` + `maybeUpdateProspectStatus`
- 1 mobile feature module: `features/appointments/` with My Schedule page
- Shared `appointment_status.dart` constants on mobile

Stage 3 picks up reminders, which read from the same `appointments` rows + their `appointment_reminders` companion.
