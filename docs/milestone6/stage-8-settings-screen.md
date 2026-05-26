# Stage 8 — Settings Screen

**Depends on:** Stage 4 (notification toggles → FCM topics), Stage 7 (biometric toggle).
**Estimated:** 1 day.

## Purpose

A single, structured Settings surface for profile photo, notification preferences, biometric, app version, sync log, and logout. Currently the mobile shell ends in a placeholder "Profile" screen; M6 turns it into the real thing.

## Scope

### 8.1 Sections

1. **Profile**
   - Avatar (tap to change → camera/library → upload to `avatars/{tenant_id}/{user_id}.jpg` → update `users.avatar_url`)
   - Name (read-only — changed via web by admin)
   - Email (read-only)
   - Role pill
2. **Notifications** — toggles, each bound to a `notification_prefs.<kind>` flag:
   - Appointment assigned
   - Appointment reminders (24h / 2h SMS pushes)
   - Document signed
   - Inbound SMS
   - Inbound call
   - Each toggle: write to Hive immediately, queue server sync, **also** call FCM topic `subscribeToTopic` / `unsubscribeFromTopic`
3. **Security**
   - Sign in with Face ID / fingerprint (Stage 7) — toggle
   - Auto-lock after 5 minutes (Stage 7) — read-only on/off (no configurable interval in M6)
4. **Sync**
   - Sync status row ("All synced" / "12 pending")
   - "Force sync now" button → calls `SyncEngine.flushAll()`
   - "Sync log" → screen with last 100 events (Stage 1.7), accessible to all users without debug-tap gating (it's useful in the field)
5. **About**
   - App version + build number (`package_info_plus`)
   - Tenant name + slug
   - Privacy policy link (external)
   - Terms of service link (external)
6. **Logout** — confirm dialog → wipe Hive + secure storage + FCM token unregister + sign out

### 8.2 Settings persistence

`UserPreferences` is a typed Hive object (`typeId: 20`). Reads are synchronous (Hive box). Writes happen in two stages:

1. Optimistic write to Hive → UI reflects instantly
2. `PendingPreferenceUpdate` (`typeId: 35`) enqueued → sync runner pushes to `users.notification_prefs`

Server-side notification_prefs is the source of truth on next refresh; local Hive is the fast path.

### 8.3 Profile photo upload

Reuses Stage 2's photo pipeline conceptually but smaller scope:
- Pick image → compress to ≤ 500 KB → upload to `avatars` Storage bucket → update `users.avatar_url`
- If offline → queue as `PendingProfilePhoto` (typeId 36); shown locally; uploads on reconnect
- New bucket `avatars` — public read, RLS-locked write to own user

Migration `040_m6_avatars_bucket.sql` creates the bucket + RLS policies + `users.avatar_url` (if not already present from earlier milestones; check first).

### 8.4 Notification permission handshake

On first launch into Settings → Notifications, if iOS notification permission hasn't been requested:
- Show inline "Allow Roof-Aid to send notifications" CTA
- Tap → triggers `FirebaseMessaging.requestPermission()` with `alert / badge / sound`
- After permission denied at OS level → toggles still show but render disabled with "Notifications disabled in iOS Settings" link

### 8.5 Logout polish

- Confirm dialog: "Sign out? You'll need to enter your email and password again."
- On confirm:
  1. `FirebaseMessaging.deleteToken()`
  2. `supabase.functions.invoke('register-device', body: { fcm_token: null })` (server clears the token)
  3. Wipe Hive boxes (`Hive.deleteFromDisk` per box)
  4. Wipe secure storage
  5. `supabase.auth.signOut()`
  6. Route to login

## Verification

1. Tap avatar → camera → take photo → see it appear immediately → online → server `users.avatar_url` updated within 30s
2. Offline → change avatar → indicator shows pending → enable network → uploads → avatar visible to other users on web
3. Toggle off "Inbound SMS" → telefonista on web sends SMS to a prospect assigned to this rufero → no push arrives → toggle back on → next SMS pushes
4. App version row matches CI build number
5. Sync log lists recent events including the conflict logs from Stage 1 chaos tests
6. Tap "Force sync now" with 3 pending items → all 3 sync within seconds
7. Logout → relaunch → login screen → log back in → previously enabled biometric is **off** (intentional: logout = clean slate)
8. iOS notification permission denied → Settings shows toggles disabled with deep-link to Settings.app

## Files

### Created
- `apps/mobile/lib/features/settings/presentation/pages/settings_page.dart`
- `apps/mobile/lib/features/settings/presentation/pages/sync_log_page.dart`
- `apps/mobile/lib/features/settings/presentation/widgets/profile_section.dart`
- `apps/mobile/lib/features/settings/presentation/widgets/notification_toggles.dart`
- `apps/mobile/lib/features/settings/presentation/widgets/security_section.dart`
- `apps/mobile/lib/features/settings/presentation/widgets/sync_section.dart`
- `apps/mobile/lib/features/settings/presentation/widgets/about_section.dart`
- `apps/mobile/lib/core/services/user_preferences.dart` (if not added earlier)
- `apps/mobile/lib/core/offline/models/pending_preference_update.dart`
- `apps/mobile/lib/core/offline/models/pending_profile_photo.dart`
- `supabase/migrations/040_m6_avatars_bucket.sql`

### Modified
- `apps/mobile/lib/features/shell/presentation/widgets/bottom_nav.dart` — Settings tab
- `apps/mobile/lib/features/auth/data/auth_repository.dart` — logout wipe
- `apps/mobile/pubspec.yaml` — add `package_info_plus`

## Out of scope
- Language / locale picker → M7 (server-side localization not ready)
- Dark mode toggle → M7+ polish
- "Sign out all devices" → M7+
- In-app feedback / support form → M7
