# Notifications — System Inventory & Candidate Trigger Points

A scan-based catalog of the existing notification system and every place in the application where a notification could plausibly be raised. Use this as a planning input when deciding which events to wire up next.

---

## 1. Current infrastructure

### Table — `notifications`

Source: `supabase/migrations/002_core_tables.sql`

| Column         | Notes                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| `id`           | uuid pk                                                                                   |
| `tenant_id`    | tenant scope                                                                              |
| `user_id`      | recipient                                                                                 |
| `type`         | one of: `appointment_assigned`, `document_signed`, `inbound_call`, `inbound_sms`, `lead_assigned`, `system_alert` |
| `title`        | short heading                                                                             |
| `body`         | detail text                                                                               |
| `related_id`   | optional uuid of the related entity                                                       |
| `related_type` | `prospect` \| `appointment` \| `document`                                                 |
| `is_read`      | boolean                                                                                   |
| `created_at`   | timestamptz                                                                               |

### Type constants

`apps/web/lib/constants/notification-types.ts` — the canonical list of allowed `type` values. Any new type must be added here AND to the DB `CHECK` constraint.

### Creator helper

`apps/web/lib/notifications/create.ts` — single function `createNotification()` used by every server action that wants to fan out a notification. **All new triggers should go through this helper** rather than direct inserts so the call site stays uniform.

### Delivery / UI

| Component                                                  | Role                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(dashboard)/notification-bell.tsx`           | Top-bar bell. Subscribes to the `notifications` table via Supabase realtime (postgres_changes). Renders unread count + last 5 items. |
| `apps/web/app/(dashboard)/notifications/`                  | Full paginated history page (20/page, see `lib/queries/notifications.ts`).                                                        |
| `apps/web/lib/queries/notifications.ts`                    | `listNotifications`, `getRecentNotifications`. Page size constant `PAGE_SIZE = 20`.                                               |
| `apps/web/lib/queries/dashboard.ts → getUnreadNotificationCount` | Used by `(dashboard)/layout.tsx` to seed the bell badge.                                                                          |

**Channels today:** in-app only (Supabase realtime + persistent row). No email, no push, no SMS.

---

## 2. Notification creators that exist today

| File\:Line                                                                | Event                                                  | Type                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------- |
| `app/(dashboard)/prospects/[id]/actions.ts:240`                          | Prospect re-assigned to a telefonista                  | `lead_assigned`                       |
| `app/(dashboard)/prospects/[id]/actions.ts:167`                          | Prospect status changed (notifies the current assignee) | `system_alert`                        |
| `app/(dashboard)/appointments/actions.ts:78`                             | Appointment created and assigned to a rufero           | `appointment_assigned` / `lead_assigned` |
| `app/(dashboard)/appointments/actions.ts:184`                            | Appointment rufero re-assigned                         | `appointment_assigned`                |

Everything else listed below is **not yet emitting notifications** — those are the candidate insertion points.

---

## 3. Candidate trigger points by domain

Format: `file:line(approx)` — **Event** — *who should hear it* — short rationale.

### 3.1 Prospect lifecycle

| Trigger                                                                       | Event                                          | Audience                                | Why                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `app/(dashboard)/new-leads/import/actions.ts`                                 | Bulk import completed                          | owner, admin (importer)                 | Summary: N imported / M dnc-skipped / K duplicates                 |
| `app/(dashboard)/prospects/[id]/actions.ts` `changeStatus()`                  | `new_leads` → `contacted`                      | assigned telefonista                    | Confirms first touch logged                                        |
| same `changeStatus()`                                                         | `contacted` → `follow_up`                      | assigned telefonista                    | Reminds owner that a follow-up is now on their queue              |
| same `changeStatus()`                                                         | `follow_up` → `appointment`                    | rufero, prospect owner                  | Already partly covered through `createAppointment()`              |
| same `changeStatus()`                                                         | `→ closed_customer`                            | owner, admin, original telefonista      | Conversion celebration / KPI                                       |
| same `changeStatus()`                                                         | `→ not_viable`                                 | admin                                   | For QA on dispositioning                                           |
| `app/(dashboard)/prospects/[id]/actions.ts` (DNC mark)                       | Prospect marked DNC                            | admin, owner                            | Compliance audit signal — see `dnc_records` table                  |
| Activity log `note_added` insertion sites                                    | New note authored                              | prospect owner (if not author)          | Keeps assignee aware of team comments                              |
| Prospect re-engaged (silent → active activity)                                | Re-engagement signal                           | assigned rep                            | Optional — derived from `activities` recency                       |

### 3.2 Communications (calls / SMS / email)

| Trigger                                                                                                  | Event                                                  | Audience                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `supabase/functions/_shared/call-handlers.ts` (Telnyx webhook → `call_logs` insert, direction='inbound') | Inbound call received                                  | assigned telefonista; admin if unassigned |
| same handler (disposition='no_answer')                                                                   | Missed call                                            | assigned telefonista                    |
| same handler (disposition='voicemail' or `recording_url` set)                                            | Voicemail / recording ready                            | assigned telefonista                    |
| SMS webhook → `sms_logs` insert (direction='inbound')                                                    | Inbound SMS                                            | assigned telefonista                    |
| SMS send path → status='failed'                                                                          | SMS delivery failure                                   | sender                                  |
| Email send path (`lib/email/actions.ts → sendEmailAction`, on failure)                                   | Outbound email send failure                            | sender                                  |
| Email read path (new — Gmail inbox poller, if added)                                                     | Inbound email tied to a known prospect                 | prospect owner                          |
| Gmail token revoked (`lib/email/gmail.ts` → 401 path that wipes `user_google_tokens`)                     | Gmail disconnected unexpectedly                        | the affected user                       |

### 3.3 Appointments

| Trigger                                                                              | Event                                          | Audience                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------- |
| `appointments/actions.ts createAppointment()`                                        | New appointment (**already implemented**)      | rufero                    |
| `appointments/actions.ts assignAppointmentRufero()`                                  | Rufero re-assigned (**already implemented**)   | new rufero                |
| cron / pg_cron job reading `reminder_24h_sent`, `reminder_2h_sent` flags             | 24h reminder, 2h reminder                      | rufero                    |
| status flips to `'no-show'`                                                          | No-show recorded                               | owner, admin              |
| `rescheduled_from` set                                                               | Appointment rescheduled                        | rufero, prospect owner    |
| status flips to `'cancelled'` (with `cancellation_reason`)                           | Cancellation                                   | rufero, prospect owner    |

### 3.4 Documents

| Trigger                                            | Event                                       | Audience                          |
| -------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| document generation flow → status='generated'      | Doc generated                               | author                            |
| send flow → status='sent'                          | Doc sent to customer                        | author                            |
| signature webhook → status='signed' (currently unused `document_signed` type) | Doc signed                                  | author, prospect owner, admin     |
| signature age cron (signed_at + N days)            | Signed doc nearing expiry                   | prospect owner                    |

### 3.5 Tasks / follow-ups

| Trigger                                                                            | Event                                  | Audience                |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| daily cron over `prospects` with status='follow_up' + a target-date note           | Follow-up due today                    | assigned telefonista    |
| daily cron — overdue                                                               | Follow-up overdue                      | telefonista + admin     |

### 3.6 User management

| Trigger                                                | Event                              | Audience              |
| ------------------------------------------------------ | ---------------------------------- | --------------------- |
| `app/(dashboard)/admin/users/actions.ts inviteUser()` | Invite sent                        | the invited user (via email out-of-band) |
| same file — role update                                | Role changed                       | the affected user     |
| same file — deactivation                               | User deactivated                   | owner, admin          |
| password reset (Supabase auth flow)                    | Reset requested                    | the affected user (email channel) |

### 3.7 System / compliance / settings

| Trigger                                                                                  | Event                                              | Audience                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| `MissingNumberBanner` precondition (no tenant SMS/voice number)                          | Banner is shown — also raise a notification        | owner, admin            |
| `canCallProspect()` returns `outside_calling_hours`                                      | Pre-call warning (soft, may not need persistence)  | the caller              |
| `dnc_records` insert / phone matches DNC during outbound attempt                         | DNC blocked                                        | the caller, admin       |
| `webhook_events` insert with `signature_ok = false` or `process_error IS NOT NULL`       | Webhook signature failure / processing error       | super_admin, admin      |
| `user_google_tokens` row removed by 401-handler in `lib/email/gmail.ts`                   | Gmail token revoked                                | the user                |
| Future rate-limit middleware                                                              | Quota exceeded                                     | owner                   |
| Daily digest cron                                                                         | Yesterday's KPIs (calls, contacts, appointments)   | owner, admin            |
| Performance threshold cron                                                                | Agent conversion rate drop                         | admin                   |

---

## 4. Audience matrix by role

Roles defined in `apps/web/lib/types/auth.ts`: `super_admin`, `owner`, `admin`, `telefonista`, `rufero`.

| Role          | Likely subscribed events                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `super_admin` | webhook failures, tenant provisioning, cross-tenant alerts                                          |
| `owner`       | KPI digests, DNC events, missing-number banner, role changes, deactivations, conversions, no-shows  |
| `admin`       | everything `owner` sees + assignment changes, overdue follow-ups, signature events                  |
| `telefonista` | lead assigned, status changes on owned prospects, inbound call/SMS/email, follow-up due/overdue, send failures |
| `rufero`      | appointment assigned / reminders / rescheduled / cancelled                                          |

---

## 5. Channels to consider

Today: **in-app only** (realtime + persistent).

Pragmatic upgrades, ordered by effort:

1. **Email digests** — daily/weekly summary for owners and overdue follow-ups for telefonistas. Reuse the per-user Gmail OAuth that already exists for the email feature, OR introduce a transactional sender (SendGrid columns already present in `email_logs`).
2. **Browser push** — Firefox/Chrome push subscriptions. Adds a `user_push_subscriptions` table; service worker already required for PWA.
3. **Mobile push** — the Flutter app can register an FCM token per user; same `notifications` row drives both surfaces.
4. **SMS for critical alerts only** — appointment no-show, signature expiring. Tenant phone number already provisioned, so cost is the only constraint.

### Suggested schema extension

Add to `notifications`:

```sql
ALTER TABLE notifications
  ADD COLUMN delivery_channels text[] NOT NULL DEFAULT '{in_app}',
  ADD COLUMN delivered_at      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN priority          text   NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
```

…and a per-user `notification_preferences` table so users can opt out of channels per type. A worker (pg_cron or external) reads rows with un-delivered channels and dispatches.

---

## 6. Implementation checklist for adding a new trigger

1. Decide on `type` — reuse an existing one if it fits, otherwise:
   - Append to the DB `CHECK` constraint via migration.
   - Append to `apps/web/lib/constants/notification-types.ts`.
2. Decide on `related_type` / `related_id` so the notification can deep-link.
3. Call `createNotification(...)` from the relevant server action / edge function — **do not** insert directly.
4. If the audience is a role (not a specific user), resolve the recipient list inside the action; create one row per recipient.
5. Realtime delivery is automatic via the bell's subscription — no client code needed.
6. Add a row to the table in this doc when you ship it.

---

## 7. Quick wins (highest value / lowest effort)

Ordered from "ship this week" to "needs design":

1. **Inbound call → telefonista** (Telnyx webhook already writes `call_logs`).
2. **Inbound SMS → telefonista** (same path).
3. **Outbound email/SMS send failure → sender.**
4. **Appointment 24h / 2h reminders** (schema flags exist; needs cron).
5. **Follow-up due/overdue digest** (cron, queries already present in `lib/queries/`).
6. **Gmail token revoked → affected user.**
7. **Webhook processing failure → admin.**
8. **Bulk import completion → importer.**
9. **DNC block during outbound attempt → caller + admin.**
10. **Daily KPI digest → owner.**
