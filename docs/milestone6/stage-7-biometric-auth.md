# Stage 7 — Biometric Authentication

**Depends on:** `local_auth` + `flutter_secure_storage` packages (pre-req).
**Estimated:** 1 day.

## Purpose

Eliminate the friction of typing email + password on every cold launch. The first login still uses credentials; subsequent launches and resume-after-5-minutes use Face ID / Touch ID / fingerprint. Daily login friction is the #1 mobile app uninstall driver — fixing this lifts retention.

## Scope

### 7.1 First-time enrollment

After a successful email + password login, on the next launch we **don't** auto-prompt. Instead, Settings → "Sign in with Face ID" toggle. On enable:

1. Prompt biometric → on success
2. Encrypt the Supabase refresh token with a key stored in `flutter_secure_storage` (iOS Keychain / Android Keystore)
3. Write `biometric_enabled = true` to `UserPreferences`
4. Show a "Biometric sign-in enabled" confirmation

### 7.2 Cold launch with biometric enabled

`main.dart` → checks `biometric_enabled` → if true:
1. Show splash + biometric prompt immediately
2. On success → decrypt refresh token → `supabase.auth.setSession(refreshToken)` → home screen
3. On cancel / fail → email + password login screen (refresh token never sent in this path)
4. On `local_auth.notAvailable` (user disabled at OS level, no enrolled biometrics) → silently disable the setting + go to email/password

### 7.3 Background → foreground lock

If app is backgrounded for > 5 minutes (configurable), require biometric on resume. Implementation: `WidgetsBindingObserver.didChangeAppLifecycleState`. While locked, app shows a frosted-glass overlay so backgrounded screenshots don't leak data.

### 7.4 Secure storage

- Refresh token written via `flutter_secure_storage` with:
  - iOS: `IOSAccessibility.first_unlock_this_device` + `accessControl: .biometryCurrentSet`
  - Android: `EncryptedSharedPreferences` (default for `flutter_secure_storage`)
- Refresh token **never** stored in plain Hive or shared prefs.

### 7.5 Recovery paths

- **Biometric data changes** (new face enrolled, new fingerprint) → iOS invalidates the keychain item → decrypt fails → fall back to email + password, re-enroll.
- **OS update wipes Keystore** (rare Android scenario) → `flutter_secure_storage` returns null → force email + password → re-enroll.
- **User logs out** → wipe secure storage + Hive + FCM token unregister + `biometric_enabled = false`.

### 7.6 Per-platform configs

- iOS `Info.plist`:
  ```xml
  <key>NSFaceIDUsageDescription</key>
  <string>Use Face ID to securely sign in to Roof-Aid.</string>
  ```
- Android `AndroidManifest.xml`: `USE_BIOMETRIC` permission (auto-added by `local_auth` but verify).
- Android `MainActivity` extends `FlutterFragmentActivity` (required by `local_auth` for biometric prompt rendering).

## Verification

1. Fresh install → email + password login → Settings → enable biometric → Face ID prompt → confirm
2. Force-quit → cold launch → Face ID prompt → success → home in <2s
3. Force-quit → cold launch → Face ID prompt → cancel → email + password screen
4. Background 6 minutes → return → biometric prompt; background 1 minute → no prompt
5. Disable biometric in Settings → cold launch → no biometric prompt; email + password instead
6. Add a new fingerprint to OS → cold launch → decrypt fails gracefully → email + password → user re-enrolls
7. Log out → cold launch → biometric is off, secure storage cleared, no auto-fill of token
8. App in background → switch to recent-apps screen → frosted overlay covers content

## Files

### Created
- `apps/mobile/lib/core/auth/biometric_service.dart`
- `apps/mobile/lib/core/auth/secure_session_store.dart`
- `apps/mobile/lib/core/lifecycle/lock_observer.dart`
- `apps/mobile/lib/features/auth/presentation/widgets/biometric_lock_overlay.dart`

### Modified
- `apps/mobile/lib/main.dart` — biometric gate before routing
- `apps/mobile/lib/features/auth/data/auth_repository.dart` — store / wipe refresh token, integrate with logout
- `apps/mobile/lib/features/auth/presentation/pages/login_page.dart` — surface "Sign in with Face ID" CTA when previously enabled
- `apps/mobile/ios/Runner/Info.plist`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/android/app/src/main/kotlin/.../MainActivity.kt` — `FlutterFragmentActivity`

## Out of scope
- PIN fallback inside the app (separate from OS biometric) → M-future
- Two-factor auth (TOTP) → M8
- Remote session revoke ("sign out all devices") → M7+
