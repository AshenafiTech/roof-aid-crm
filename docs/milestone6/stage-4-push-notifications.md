# Stage 4 — Push Notifications (FCM)

**Depends on:** Firebase project + APNs cert configured (pre-req), migration `036_m6_fcm_tokens.sql`.
**Blocks:** the "tap-notification-to-deep-link" flows in Stages 5–6.
**Estimated:** 1.5 days.

## Purpose

Deliver real-time alerts to a rufero's phone — new appointment assignments, signed documents, inbound SMS — even when the app is backgrounded or closed. Tapping any push opens the right record.

## Scope

### 4.1 Schema

Migration `036_m6_fcm_tokens.sql` (executed in pre-reqs):

```sql
alter table users
  add column fcm_token text,
  add column fcm_token_updated_at timestamptz,
  add column notification_prefs jsonb not null default '{
    "appointment_assigned": true,
    "appointment_reminder": true,
    "document_signed": true,
    "inbound_sms": true,
    "inbound_call": true
  }'::jsonb;

create index on users (fcm_token) where fcm_token is not null;

create table notification_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  kind text not null,                -- 'appointment_assigned' | 'document_signed' | ...
  resource_type text not null,
  resource_id uuid not null,
  fcm_message_id text,
  status text not null,              -- 'pending' | 'sent' | 'failed' | 'token_dropped'
  error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);
```

Idempotency key shape: `{kind}:{resource_id}:{user_id}` — so the same event firing twice can't double-push.

### 4.2 Mobile registration

On app launch (and on auth state change to logged-in):

```dart
final token = await FirebaseMessaging.instance.getToken();
await supabase.functions.invoke('register-device', body: {'fcm_token': token});
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
  supabase.functions.invoke('register-device', body: {'fcm_token': newToken});
});
```

The `register-device` Edge Function upserts `users.fcm_token` + `fcm_token_updated_at = now()` for the calling user (auth-derived `auth.uid()`).

### 4.3 Server send

New Edge Function `send-push` invoked by Postgres triggers + by other Edge Functions:

- Trigger on `appointments` insert when `assigned_to` changes → enqueue `appointment_assigned` push for the rufero.
- Trigger on `documents` update where `status` → `'signed'` → enqueue `document_signed` push for the assigned admin + the prospect's owner.
- Inbound SMS pipeline (M4 `telnyx-webhook`) → enqueue `inbound_sms` push for the prospect's assigned rufero.

Send path:
1. Check `notification_prefs[kind] == true` for the target user. Skip if disabled.
2. Insert `notification_sends` with `status: 'pending'` and the idempotency key (conflict → no-op, drop the duplicate).
3. POST to FCM HTTP v1 with Firebase service account JWT.
4. On 200 → `status: 'sent'`, store `fcm_message_id`.
5. On `UNREGISTERED` or `INVALID_ARGUMENT` → `status: 'token_dropped'`, null out `users.fcm_token` (forces re-register on next launch).
6. On 5xx → `status: 'failed'`, retry once with a 30s delay via `pg_cron`.

### 4.4 Payload shape

FCM data-only payload (no `notification` block) so the app gets the message in all three states (foreground/background/terminated). The app renders the local notification itself via `flutter_local_notifications`:

```json
{
  "data": {
    "type": "appointment_assigned",
    "tenant_id": "<uuid>",
    "resource_id": "<appointment-id>",
    "title": "New appointment",
    "body": "123 Main St — Today at 3:00 PM"
  }
}
```

Title + body are computed server-side and localized to the recipient's locale (per `users.locale`, default `en`).

### 4.5 Foreground / background / terminated handling

- **Foreground** — `FirebaseMessaging.onMessage` → display via `flutter_local_notifications` + optionally update local state (e.g., refetch appointments).
- **Background** — `FirebaseMessaging.onBackgroundMessage` (Dart top-level handler) → display local notification. No heavy work.
- **Terminated tap** — `FirebaseMessaging.instance.getInitialMessage()` on cold start. If present, route to the resource.

### 4.6 Tap routing

`PushRouter.handle(data)` switches on `data.type`:
- `appointment_assigned` / `appointment_reminder` → `/appointments/:id`
- `document_signed` → `/documents/:id`
- `inbound_sms` → `/prospects/:id?tab=sms`
- `inbound_call` → `/prospects/:id?tab=calls`

If offline at tap time → load from Hive cache; if missing → show "Loading… [Retry]" screen rather than crashing.

### 4.7 Notification preferences ↔ FCM topics

Each preference toggle corresponds to a topic subscription:

- `appointment_assigned` → topic `tenant_<id>_user_<id>_appointments`
- `document_signed` → topic `tenant_<id>_user_<id>_documents`
- …

`send-push` skips by pref flag (4.3 step 1) **and** the device unsubscribes from the topic on toggle-off. Belt-and-suspenders prevents the "I toggled it off but still got pushed" bug.

## Verification

1. Telefonista assigns new appointment to a rufero → rufero phone shows push within 10s
2. Force-quit the app → push still arrives → tap → app opens directly on appointment detail
3. Background the app → inbound SMS → push appears with prospect name → tap → opens prospect SMS tab
4. Toggle `Appointment assigned` off in Settings → assign another → no push arrives → toggle back on → next assignment pushes
5. Reinstall the app → first launch registers a new token → push to the user goes through new token; the old token shows `status: 'token_dropped'` after one attempted send
6. Fire the same trigger twice (e.g., manually invoke `send-push` with identical idempotency key) → exactly one row, exactly one push
7. iOS: TestFlight build with APNs cert receives pushes both in foreground and after device lock
8. Push received offline → tap → cached appointment loads from Hive without network

## Files

### Created
- `apps/mobile/lib/core/push/firebase_setup.dart`
- `apps/mobile/lib/core/push/push_router.dart`
- `apps/mobile/lib/core/push/notification_prefs_repository.dart`
- `supabase/functions/register-device/index.ts`
- `supabase/functions/send-push/index.ts`
- `supabase/functions/_shared/fcm-client.ts`
- `supabase/migrations/036_m6_fcm_tokens.sql`
- `supabase/migrations/039_m6_push_triggers.sql` — DB triggers that invoke `send-push`

### Modified
- `apps/mobile/lib/main.dart` — Firebase init, background handler
- `apps/mobile/lib/features/auth/data/auth_repository.dart` — register token after login, clear on logout
- `apps/mobile/lib/features/shell/presentation/pages/shell_page.dart` — handle `getInitialMessage`
- `apps/mobile/pubspec.yaml` — add `firebase_core`, `firebase_messaging`, `flutter_local_notifications`
- `supabase/functions/telnyx-webhook/index.ts` — enqueue push on inbound SMS

## Out of scope
- Web push → M7+
- Per-recipient scheduling rules ("only push between 8am-8pm in user TZ") → M7 (M6 ships always-on; M5 reminders already obey calling-hours via SMS)
- Rich pushes with images → M-future
