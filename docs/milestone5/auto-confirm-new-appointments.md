# Auto-confirm new appointments

## Purpose
Skip the "pending" intermediate state when an appointment is created. New appointments now go directly to `confirmed` so users don't have to perform a separate confirmation step.

## Change
- [apps/web/app/(dashboard)/appointments/actions.ts:268](apps/web/app/(dashboard)/appointments/actions.ts#L268) — the `appointments` insert now sets `status: "confirmed"` instead of `status: "pending"`.

## Notes
- This is the only insert site for `appointments` in the web app (verified by grep across `apps/web`).
- The mobile app does not insert appointments; its `pending:<id>` cache keys refer to offline status-transition sync, which is unrelated and unaffected.
- The `pending` status remains valid in the database schema (`025_m5_appointments_and_availability.sql`) and in transition/reminder logic — existing pending rows continue to behave the same. Only new appointments skip pending.
- Reschedule guard at [actions.ts:416](apps/web/app/(dashboard)/appointments/actions.ts#L416) still accepts both `pending` and `confirmed`, so reschedules continue to work for any pre-existing pending appointments.
