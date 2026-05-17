# Email Push Notifications + Notification Settings

## Purpose

Let users receive a browser push notification when a new email arrives in
their connected Gmail inbox, and give them a place in Settings to turn that
behavior on or off.

The email module is web-only and reads Gmail through an OAuth-polled API
(no webhook, no Pub/Sub). This change adds:

1. A per-user preference stored in Supabase.
2. A new **Settings → Notifications** page where users grant the browser
   permission and toggle the preference.
3. A polling loop on `/email` that uses the browser **Notification API** to
   alert the user when an unread message newer than page-load time appears.

## Scope decisions

- **Browser Notification API only** (not Web Push). Notifications fire while
  the email tab is open. True background push would require a service
  worker, VAPID keys, and a server-side poller — out of scope for now.
- **Settings page** lives at `/admin/settings/notifications` and follows the
  existing settings card pattern. The hub gets a new "Notifications" card.
- **Storage**: new `notification_preferences` table, one row per user, with
  RLS scoped to `auth.uid()`. Matches the design sketched in
  `docs/notification/notification.md` so future channels (SMS, calls,
  appointments) can hang additional columns off the same row.

## Files touched

### New

- `supabase/migrations/028_notification_preferences.sql`
  Table + RLS + `set_updated_at` trigger.
- `apps/web/lib/notifications/preferences.ts`
  Server actions `getNotificationPreferences` and
  `updateNotificationPreferences` (upsert).
- `apps/web/app/(dashboard)/admin/settings/notifications/page.tsx`
  Server page that loads the user's current preferences.
- `apps/web/app/(dashboard)/admin/settings/notifications/notifications-form.tsx`
  Client form. Manages browser permission state, shows a permission banner,
  and renders the toggle row.

### Updated

- `apps/web/app/(dashboard)/admin/settings/page.tsx`
  Added a `Notifications` card linking to the new page.
- `apps/web/app/(dashboard)/email/page.tsx`
  Loads `notification_preferences` and passes
  `emailNotificationsEnabled` down to the workspace.
- `apps/web/app/(dashboard)/email/email-workspace.tsx`
  Polls the inbox every 60 s while Gmail is connected and the preference is
  enabled. Fires a `Notification(...)` for any unread message whose
  `internalDate` is newer than the most recent message at page load.
- `apps/web/lib/supabase/database.types.ts`
  Manually inserted the `notification_preferences` types so server code
  typechecks before someone re-runs the Supabase type generator.

## Behavior details

- The notification baseline timestamp is initialised from the newest
  message in the initial inbox payload (or `Date.now()` if the inbox is
  empty). This avoids re-notifying for emails that already existed when
  the page loaded.
- When multiple new messages arrive in the same poll tick, the loop fires
  a single batched notification (`"N new emails"`) instead of one per
  message.
- Clicking a notification focuses the tab and navigates to `/email`.
- If the user toggles the preference **on** and permission is still
  `default`, the form calls `Notification.requestPermission()` once.
- If permission is `denied` we keep the preference togglable but show a
  banner explaining that browser settings need to be changed.

## How to run the migration

```bash
supabase migration up
# or
psql "$SUPABASE_DB_URL" -f supabase/migrations/028_notification_preferences.sql
```

After applying, regenerate Supabase types to overwrite the manually-edited
`database.types.ts` block:

```bash
supabase gen types typescript --local > apps/web/lib/supabase/database.types.ts
```

## Manual test plan

1. Apply the migration.
2. Sign in as a telefonista/owner; visit `/admin/settings`. Verify the
   new **Notifications** card appears and links to the page.
3. On the Notifications page, click **Allow** → browser prompt → grant.
4. Confirm the green "enabled" banner replaces the prompt and the toggle
   for "New email" is on.
5. Open `/email` (Gmail must be connected). Send yourself an email from
   another account.
6. Within ~60 s the browser should show a notification with the sender
   and subject. Click it → tab focuses and lands on `/email`.
7. Return to Settings, toggle "New email" off. Send another test email.
   No notification should fire.

## Future work

- Add a service worker + VAPID keys to deliver background push when the
  app tab is closed (sketched in `docs/notification/notification.md`).
- Add more preference rows: new SMS, missed call, appointment reminders.
- Surface the same preferences in the Flutter mobile app (FCM —
  `users.fcm_token` is already provisioned).
