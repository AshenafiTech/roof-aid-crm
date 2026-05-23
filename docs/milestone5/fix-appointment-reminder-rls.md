# Fix: Appointment reminder trigger violates RLS

## Purpose
Resolve `42501 — new row violates row-level security policy for table "appointment_reminders"` raised when creating or rescheduling an appointment.

## Root cause
`supabase/migrations/030_m5_appointment_reminders.sql` enables RLS on `appointment_reminders` with only a SELECT policy (writes were intentionally restricted to the lifecycle trigger and the Edge Function). The lifecycle trigger function `schedule_appointment_reminders()` was, however, declared without `SECURITY DEFINER`, so it executed as the calling user. Its INSERT / UPDATE / DELETE statements against `appointment_reminders` were then evaluated under the caller's RLS context, where no write policy exists — and were rejected.

## Trigger path
1. UI submits "schedule appointment" → `createAppointment` server action inserts into `appointments`.
2. `appointments_reminder_lifecycle` AFTER INSERT trigger fires.
3. `schedule_appointment_reminders()` attempts to insert the 24h / 2h reminder rows.
4. RLS blocks the insert; the action returns `42501` to the client.

The pure rufero re-assignment path does not hit this — the trigger's branches only fire on status / `scheduled_at` changes — but the same error surfaces from `createAppointment` and `rescheduleAppointment`, both reached through the scheduling dialog.

## Change
Added `supabase/migrations/034_m5_reminder_trigger_security_definer.sql` which `CREATE OR REPLACE`s `schedule_appointment_reminders()` with:

- `SECURITY DEFINER` — the function now runs with the privileges of its owner (postgres), bypassing the caller's RLS as the migration originally intended.
- `SET search_path = public` — pins the search path so `SECURITY DEFINER` is safe against search-path hijacking.
- `REVOKE ALL ... FROM PUBLIC` — keeps direct execution restricted; only the trigger invokes it.

The body is unchanged from migration 030.

## Apply
```
supabase db push --include-all
```

The local environment used in this session could not reach `db.<ref>.supabase.co` over IPv6, so the push must be run from a network with IPv4 access to the direct Postgres host (or via the Supabase pooler).

## Verification
After applying:
1. Schedule a new appointment from the UI — no `42501` error.
2. `SELECT prosecdef FROM pg_proc WHERE proname = 'schedule_appointment_reminders';` returns `t`.
3. Two rows appear in `appointment_reminders` for the new appointment (`24h`, `2h`).
