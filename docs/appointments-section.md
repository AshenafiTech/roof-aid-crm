# Appointments Section

## Purpose
Replace the basic appointments table with a full section: a list view sorted by appointment date with extended filters, inline rufero assignment, and a month-grid calendar view.

## Background
`/appointments` already had a list, stats cards, and a status/time filter, but:
- No way to filter by rufero or sort the list.
- Owners/admins had to open each prospect's detail page to reassign the rufero on an appointment.
- No calendar view.

The schema (`supabase/migrations/002_core_tables.sql:88-105`) defines `appointments.rufero_id uuid NOT NULL`, so an appointment must always have a rufero. The UI never allows unassigning — only reassigning.

## Changes

### Server actions — new file `apps/web/app/(dashboard)/appointments/actions.ts`
- `assignAppointmentRufero({ appointmentId, ruferoId })` — reassigns the rufero on an appointment.
  - Permission gate: `canAssignProspects(role)` (owner/admin/super_admin only).
  - Logs an `activities` row tied to the prospect with `metadata.kind = "appointment_rufero"` and the from/to ids.
  - Sends a `lead_assigned` notification to the new rufero (unless self-assigning).
  - Revalidates `/appointments`.
- `listRuferos()` — fetches active ruferos for the assignment dropdown (mirrors the prospect-side helper).

### Queries — `apps/web/lib/queries/appointments.ts`
- `AppointmentFilters` gained `ruferoId` and `sort` (`date_asc | date_desc | created_desc`). The `assignedTo` slot is reserved for role-scoping (rufero users see only their own).
- Sort precedence: explicit `sort` param wins; otherwise `timeRange` picks the natural direction (`upcoming` asc, `past` desc, `today` asc).
- New `listAppointmentsInRange({ start, end, status, assignedTo, ruferoId })` — fetches up to 1000 appointments in a window for the calendar grid (no pagination).

### Filters bar — `apps/web/app/(dashboard)/appointments/appointment-filters.tsx`
- Added a list/calendar view toggle (writes `view=calendar` to URL).
- Added a rufero filter (visible only when `showRuferoFilter` is true — i.e. owner/admin).
- Added a sort dropdown (hidden in calendar mode).
- All filters reset `?page=` so navigating doesn't strand a user on a now-empty page.

### Table — `apps/web/app/(dashboard)/appointments/appointment-table.tsx`
- Rufero column now renders an inline `<Select>` for users with assign permission, calling `assignAppointmentRufero` and `router.refresh()` on success. Read-only users see the formatted name (unchanged).
- Grid widened from `120px` to `180px` for the rufero column to fit the select trigger.

### Calendar — new `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx`
- Client component. Reads `month=YYYY-MM` from URL (default = current month).
- 6-week grid (42 day cells) starting Sunday-of-the-week-containing the 1st.
- Each cell shows the day number, count, and up to 4 chips (`HH:MM Prospect Name`) color-coded by status; overflow shown as "+N more".
- Today is highlighted with a filled circle on the date number.
- Header has `Today`, `←`, `→` controls that update the `month` URL param. Other filters (status, rufero) carry through.
- All chips are `<Link>`s to the prospect detail page.

### Page — `apps/web/app/(dashboard)/appointments/page.tsx`
- Added `view`, `month`, `rufero`, `sort` to the parsed search params.
- Always fetches stats and (for owner/admin) the rufero list; passes them to the filters and table.
- Branches between `<ListView>` and `<CalendarView>` server components based on `view`.
- Rufero users continue to be scoped to `assignedTo: user.id` in both views.

## Permissions recap
- **Rufero**: sees only their own appointments (forced via `assignedTo`); cannot reassign; doesn't see the rufero filter.
- **Owner / admin / super_admin**: sees all appointments, can filter by rufero, can reassign inline from the table.
- **Telefonista**: sees all appointments, but cannot reassign (read-only rufero column).

## Files touched
- Added: `apps/web/app/(dashboard)/appointments/actions.ts`
- Added: `apps/web/app/(dashboard)/appointments/appointment-calendar.tsx`
- Modified: `apps/web/app/(dashboard)/appointments/page.tsx`
- Modified: `apps/web/app/(dashboard)/appointments/appointment-filters.tsx`
- Modified: `apps/web/app/(dashboard)/appointments/appointment-table.tsx`
- Modified: `apps/web/lib/queries/appointments.ts`

## View persistence + active highlight (follow-up)
- The list/calendar toggle is now styled as a tablist: the active tab uses the `default` button variant (filled with the primary color and a subtle shadow) while the inactive tab uses `ghost` with muted text. `aria-selected` is set so screen readers announce the active view.
- Choice is persisted in an `appt_view` cookie (`samesite=lax`, 1-year max-age) written from the client when the user toggles. The page resolves the active view as `URL ?? cookie ?? "list"` via `next/headers` `cookies()` so revisits to a bare `/appointments` URL respect the prior choice. The resolved value is passed down as `currentView` so the toggle highlight stays correct even when the URL has no `view` param.

## Schedule Appointment dialog (follow-up)
- Added `createAppointment({ prospectId, ruferoId, scheduledAt, durationMinutes, notes })` server action in `apps/web/app/(dashboard)/appointments/actions.ts`. Validates the scheduled time is in the future, verifies the chosen user is an active rufero, inserts the row, logs an `activities` entry of type `appointment`, notifies the rufero (unless self-assigning), and revalidates `/appointments`, `/prospects`, and `/prospects/[id]`. As a side effect, if the prospect's status is anything other than `scheduled` or `closed_customer`, it's flipped to `scheduled` so the pipeline reflects the booking.
- Permission: gated on `canEditProspect(role)` — owner, admin, telefonista, super_admin can schedule. Ruferos cannot create appointments (they receive them).
- Built a single shared component `apps/web/components/shared/schedule-appointment-dialog.tsx` (`ScheduleAppointmentDialog`) that lazy-loads the rufero list when opened, defaults to the prospect's currently-assigned user if that user is a rufero, validates required fields client-side, and calls `router.refresh()` on success.
- Wired up three previously-broken Schedule entry points to use the shared dialog:
  1. `apps/web/app/(dashboard)/prospects/prospect-row-actions.tsx` — the icon button on `/prospects` table rows (was a "Coming soon" toast).
  2. `apps/web/components/shared/prospect-list-view.tsx` list-view row icon button (was firing a stub success toast).
  3. `apps/web/components/shared/prospect-list-view.tsx` card-view "Schedule" button (same stub).
- The old inline `ScheduleDialog` function in `prospect-list-view.tsx` was removed.
- `prospect-table.tsx` now passes the prospect's `assigned_to` and a formatted location to the row actions so the dialog can pre-select a rufero and display the address.
- No Google Calendar / external integration. The dialog only writes to the `appointments` table.

## Removed: /scheduled list page (follow-up)
- The standalone `/scheduled` route and its sidebar entry were removed because the appointments section now provides a richer view of the same information (date sort, calendar grid, rufero filter/assign).
- The `scheduled` prospect status itself **stays in place** — it's still part of the prospect pipeline and is referenced by `canTransition()` (a rufero can transition `scheduled` → `closed_customer | not_viable`). The status is still selectable from the prospect detail pipeline tab and from the `/all-leads` status filter.
- Files removed: `apps/web/app/(dashboard)/scheduled/page.tsx`. Sidebar nav entry and the unused `CalendarCheck` icon import were dropped from `apps/web/app/(dashboard)/nav-items.ts`.
