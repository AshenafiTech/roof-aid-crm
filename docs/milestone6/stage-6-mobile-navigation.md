# Stage 6 — Mobile Navigation (Maps Deep-Link)

**Depends on:** Stage 5 (Navigate button mounts here). `url_launcher` already in `pubspec.yaml`.
**Estimated:** 0.5 day.

## Purpose

A tap on **Navigate** in the appointment detail must hand off to the user's preferred map app with turn-by-turn directions already plotted. No copy-paste, no "open in browser." Time-on-screen for navigation is zero seconds — the rufero is now driving.

## Scope

### 6.1 Default behavior

Single tap:
- **iOS** → Apple Maps via `maps://?daddr={lat},{lng}&dirflg=d` (driving). Falls back to Google Maps if Apple Maps is uninstalled (rare but possible).
- **Android** → Google Maps via `google.navigation:q={lat},{lng}&mode=d`. Falls back to a generic `geo:` URI if Google Maps isn't installed.

Address is geocoded server-side at prospect creation (M3-4). Coordinates come from the cached prospect — no network call needed at tap time.

### 6.2 Long-press menu

Long-press the Navigate button → bottom sheet listing installed map apps:
- Apple Maps (iOS only)
- Google Maps
- Waze (`waze://?ll={lat},{lng}&navigate=yes`)

Detect installation by attempting `canLaunchUrl` per scheme. Hide options that can't launch. Remember the last choice in `UserPreferences` (Stage 8) — next single-tap uses that.

### 6.3 Fallback chain

1. Coordinates available + preferred app installed → launch with coords
2. Coordinates available + preferred app missing → launch with another installed app
3. Coordinates missing (legacy prospect, geocoding failed) → launch by address text (Apple/Google Maps both accept `q=` with a string)
4. All launches fail → snackbar "No map app available. [Copy address]"

### 6.4 iOS Info.plist allowlist

`LSApplicationQueriesSchemes` must list `comgooglemaps`, `waze`, `maps` — otherwise `canLaunchUrl` returns false even when the app is installed. Update `apps/mobile/ios/Runner/Info.plist`.

### 6.5 Telemetry

Log to `activities` (via Stage 1 mutation): `{ action: 'navigation_launched', resource: 'appointment:<id>', map_app: 'apple_maps' }`. Useful for M7 analytics ("Are ruferos actually using Navigate?").

## Verification

1. iOS phone with Apple Maps installed → tap Navigate → Apple Maps opens, driving directions plotted to prospect
2. Android phone → tap Navigate → Google Maps opens with directions
3. Long-press → bottom sheet shows all installed map apps; pick Waze → Waze opens with destination
4. Last-used preference persists: pick Waze, back out, single-tap Navigate next time → Waze opens directly
5. Uninstall Apple Maps (iOS) → tap Navigate → falls back to Google Maps; if neither installed → snackbar
6. Prospect with null coordinates → Navigate launches by address text instead of lat/lng
7. Activity log shows `navigation_launched` rows for each tap

## Files

### Created
- `apps/mobile/lib/core/services/map_launcher.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/navigate_button.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/map_app_picker_sheet.dart`

### Modified
- `apps/mobile/ios/Runner/Info.plist` — `LSApplicationQueriesSchemes`
- `apps/mobile/lib/features/appointments/presentation/pages/appointment_detail_page.dart` — mount `NavigateButton`
- `apps/mobile/lib/core/services/user_preferences.dart` — persist last-used map app

## Out of scope
- Multi-stop routing (driver does 5 inspections in a row) → M7+ ("Route my day" optimization)
- ETA / traffic awareness inside the app → never; map apps own that
- In-app Mapbox / Google Maps SDK turn-by-turn → not on roadmap; deep-link is the right call
