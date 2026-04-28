# Dark Mode + Colorized Icon Palette

## Purpose

1. Add a dark counterpart to `AppTheme` so the app respects the user's system
   brightness preference (and a temporary toggle in the app bar).
2. Replace the washed-out monochrome icons on cards and list tiles with a
   **semantic color palette** — location = teal, phone = green, email =
   cyan, etc. — so the UI feels alive without being noisy.

## Dark Mode

### Strategy

- **Default is `ThemeMode.system`** — the app follows the device setting.
  Ruferos working outdoors get light (higher contrast in sunlight); users
  working in low-light get dark automatically.
- **Temporary toggle in the shell app bar** (sun/moon `IconButton`) for
  quick testing; will be removed when the Settings screen lands with a
  proper Light / Dark / System control.
- **No persistence yet.** Choice is lost on app restart. Persist via
  `SharedPreferences` when the real Settings toggle arrives.

### Palette Derivation

The dark scheme is **not** an auto-desaturated clone of the light one.
Key shifts:

| Role                | Light       | Dark        | Reason                                      |
| ------------------- | ----------- | ----------- | ------------------------------------------- |
| `primary`           | indigo-800  | indigo-500  | indigo-800 goes muddy on dark slate         |
| `secondary`         | orange-600  | orange-400  | warm accent brighter for dark contrast      |
| `surface`           | white       | slate-900   | pure black is too severe; slate softens it  |
| `surfaceContainer`  | slate-100   | slate-800   | elevated cards read as "lifted" in dark     |
| `onSurface`         | slate-900   | slate-100   | warm off-white prevents eye-strain          |
| `outline`           | slate-300   | slate-600   | preserves the "rimmed" card look            |

### Files

| File                                              | Change                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| `apps/mobile/lib/core/theme/app_theme.dart`       | Split into `_build(ColorScheme, _ModeTokens)`; adds `dark` getter + `_darkColors` + `_DarkTokens`. |
| `apps/mobile/lib/core/theme/theme_controller.dart`| **New** — `ValueNotifier<ThemeMode>` singleton + `toggle()` + `resolvedBrightness(context)`. |
| `apps/mobile/lib/app.dart`                        | `MaterialApp.router` wrapped in `ValueListenableBuilder<ThemeMode>`; passes `theme`, `darkTheme`, `themeMode`. |
| `apps/mobile/lib/features/shell/main_shell.dart`  | Temporary sun/moon `IconButton` in the app bar; fixed hardcoded `Colors.black87` on the user-menu name. |
| `apps/mobile/lib/features/auth/presentation/pages/login_page.dart` | Radial glow + ShaderMask + wordmark now pull from `colorScheme.primary`/`colorScheme.tertiary` so they adapt. |

## Colorized Icon Palette

### New tokens on `AppTheme`

Pulled from the tailwind 500-600 range because those values stay legible on
both white surfaces *and* slate-900 dark surfaces.

| Token               | Hex        | Use                                      |
| ------------------- | ---------- | ---------------------------------------- |
| `iconLocation`      | `#14B8A6`  | teal — address / map pins                |
| `iconPhone`         | `#16A34A`  | green — phone numbers, Call button       |
| `iconEmail`         | `#0891B2`  | cyan — email field                       |
| `iconPerson`        | `#6366F1`  | indigo — name / contact person           |
| `iconMoney`         | `#D97706`  | amber — monetary values                  |
| `iconWeather`       | `#0EA5E9`  | sky — hail size / weather data           |
| `iconCoord`         | `#7C3AED`  | violet — lat/lng coordinates             |
| `iconTimeNew`       | `#EC4899`  | pink — "created at"                      |
| `iconTimeUpdate`    | `#F59E0B`  | amber — "last updated"                   |
| `iconLock`          | `#F59E0B`  | amber — password / lock                  |
| `iconNav`           | `#2563EB`  | blue — Navigate button                   |
| `iconSms`           | `#8B5CF6`  | violet — SMS button                      |

### Application

- **`overview_tab.dart`** `_KeyValue` now accepts an optional `iconColor`
  and renders the icon inside a soft 30×30 tinted square
  (`iconColor @ 12%`). This "chip behind the glyph" pattern makes the
  color readable without fighting text contrast.
- **`prospect_list_tile.dart`** location icon → `iconLocation`, phone
  icon → `iconPhone`.
- **`login_page.dart`** email field `prefixIcon` → `iconEmail`; password
  field `prefixIcon` → `iconLock`.
- **`quick_actions_bar.dart`** three action buttons now each use a
  per-button `styleFor(tint)` so Call / SMS / Navigate are visually
  distinct (green / violet / blue) instead of three identical tonal buttons.

### Rationale

- A 12%-alpha tint background lets the colored glyph "breathe" against
  both light and dark surfaces without needing per-mode overrides.
- Per-button color on the Quick Actions Bar gives field Ruferos instant
  visual affordance — color carries meaning before the text is read.

## Decisions

- **Toggle always snaps from `system` to the opposite of platform
  brightness** on first tap — users expect "tapping the moon gives me dark
  now", not "tap once to set explicit, tap again to toggle".
- **Icon-tint square (not raw colored glyph)** because raw `#16A34A`
  glyphs at 16 px can read "alert-green" against a white card. The 12%
  square frames it as decorative.
- **Dark mode snackbar is inverted** — slate-100 bg with slate-900 text
  — so toasts don't blend into the dark surface.
- **Login ShaderMask now uses `primary` → `tertiary`** (indigo → cyan) for
  a more vivid multi-hue gradient that reads well in both modes.

## Verification

- `flutter analyze` — clean, 0 issues.
- Temporary toggle button confirmed to flip themes at runtime without
  requiring app restart.

## Next

- Persistence: wire `SharedPreferences` into `ThemeController` once the
  Settings screen exists; remove the shell app-bar toggle.
- iOS setup: `LSApplicationQueriesSchemes`, `NSLocationWhenInUseUsageDescription`,
  Google Maps iOS API key.
- Notes composer inside the Notes tab.
