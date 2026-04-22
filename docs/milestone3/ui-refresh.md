# Mobile UI Refresh — Premium Look & Feel

## Purpose

Elevate the mobile app's visual design from a stock Material 3 palette to a
professional, branded "Roof-Aid" look with selective Liquid Glass
(iOS 26-style frosted) surfaces — while keeping outdoor legibility front-of-mind
for field Ruferos who use the app in direct sunlight.

## Design Direction

### Palette

The app now uses a deep **indigo primary** paired with a **roof-aid orange
accent**, layered on a **slate-grey surface scale**:

| Token                 | Hex        | Purpose                                      |
| --------------------- | ---------- | -------------------------------------------- |
| `brandPrimary`        | `#1E3A8A`  | Indigo-800 — primary actions, brand surfaces |
| `brandPrimaryDark`    | `#1E40AF`  | Gradient stop for shaders / halo rings       |
| `brandAccent`         | `#E8501F`  | Warm orange — call-to-action / highlights    |
| `success`             | `#16A34A`  | Signed/won statuses                          |
| `warning`             | `#F59E0B`  | Appointment set, cautionary states           |
| `danger`              | `#DC2626`  | DNC banner, destructive actions              |
| `slate50`…`slate900`  | —          | Surface tonal scale                          |

Rationale: indigo communicates trust and professionalism without reading as
"consumer-playful" (which a bright sky-blue does). Slate-grey surfaces have more
depth than pure `#FFFFFF` and reduce glare in strong light.

### Liquid Glass

Applied **selectively** — only on *floating* surfaces where content shows
through:

- Quick Actions Bar at the prospect detail bottom
- Map "count chip" overlay
- Future: in-app toast/snackbar refinement

Never on full-screen backgrounds, list tiles, or dense forms — outdoor
readability beats visual flash.

## Steps Taken

1. **Rewrote `core/theme/app_theme.dart`**
   - Replaced the simple `ColorScheme.fromSeed` with an explicit
     `ColorScheme(...)` mapping all token roles (primary, onPrimary,
     primaryContainer, surfaceContainerLow/High, outline, outlineVariant, etc.).
   - Added brand-tinted `cardShadow` helper and pushed it through `CardTheme`
     (elevation 1.5, slate200 @ 80% border, 16-radius corners).
   - Reshaped `NavigationBarTheme`, `TabBarThemeData`, `SegmentedButtonThemeData`,
     `ChipThemeData`, `SnackBarThemeData`, `DialogThemeData`, `PopupMenuThemeData`.
   - `InputDecorationTheme` now shows a 2-px indigo focus ring.
   - Swapped splash to `InkSparkle.splashFactory` for a slightly more tactile
     feel on Android.

2. **Created `core/widgets/glass_surface.dart`**
   - Reusable `GlassSurface` widget wrapping `BackdropFilter + ImageFilter.blur`
     with configurable `blurSigma`, `tintOpacity`, `tintColor`, and `border`.
   - Renders identically on iOS and Android.

3. **Polished `prospect_list_tile.dart`**
   - Status indicator bar now uses a `LinearGradient` (status color →
     status color @ 60%) plus a soft `BoxShadow` glow.
   - `_StatusChip` gets a gradient fill and a 25%-alpha colored border for a
     "rimmed" badge look.

4. **Glassed `quick_actions_bar.dart`**
   - Replaced flat `Material(elevation: 8)` with a `DecoratedBox` + top-edge
     `BoxShadow` wrapper around a `GlassSurface(tintOpacity: 0.85,
     blurSigma: 28)`.
   - The bar now reads as "floating" over the Overview tab content.

5. **Glassed the map `_CountChip` overlay**
   - Same frosted treatment, slightly lighter tint (`0.78`) since it floats
     over live map tiles.
   - White hairline border at 50% alpha gives it a pill-shaped "glass disc"
     silhouette.

6. **Reworked `login_page.dart`**
   - Added a soft `RadialGradient` brand glow behind the card
     (`Alignment(0, -0.6)`, 12% → surface).
   - Replaced the flat roofing icon with a **halo ring** — a
     `Container(RadialGradient)` wrapping a `ShaderMask(LinearGradient
     [brandPrimary, brandPrimaryDark])` over `Icons.roofing`.
   - `Roof-Aid` wordmark in indigo, `w800`, tight `-0.5` letter spacing.
   - Card inherits shape/elevation from the updated theme — no more
     one-off overrides.

## Files Changed

| File                                                                           | Change                              |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| `apps/mobile/lib/core/theme/app_theme.dart`                                    | Full rewrite                        |
| `apps/mobile/lib/core/widgets/glass_surface.dart`                              | **New** — reusable frosted surface  |
| `apps/mobile/lib/features/prospects/presentation/widgets/prospect_list_tile.dart` | Gradient status bar + chip rework |
| `apps/mobile/lib/features/prospects/presentation/widgets/quick_actions_bar.dart`  | Liquid-glass bottom bar            |
| `apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart`   | Liquid-glass count chip            |
| `apps/mobile/lib/features/auth/presentation/pages/login_page.dart`                | Brand glow + halo icon             |

## Decisions & Notes

- **Not glassing the NavigationBar.** It needs rock-solid contrast for the
  always-visible tab switcher. A flat slate surface with a 2-px indigo
  indicator reads more clearly.
- **Status chip border is 25% alpha, not 100%.** At full alpha the rim fights
  the gradient fill. 25% adds just enough definition against white cards.
- **No dark mode yet.** Theme is light-only; a dark counterpart will be layered
  in when field-night-use requirements come in from the client.
- **Liquid Glass on Android:** `BackdropFilter` is cross-platform in Flutter —
  the visual is identical to iOS. No native channel work needed.

## Verification

- `flutter analyze` — clean, 0 issues.
- Manual device run (Android emulator): login screen, prospect list tile,
  map count chip, and bottom action bar all render as designed.

## Next

- iOS setup: `LSApplicationQueriesSchemes` for `tel`/`sms`/`geo`,
  `NSLocationWhenInUseUsageDescription`, and the Google Maps iOS API key in
  `AppDelegate.swift`.
- Notes composer: `NoteEntity` + repository `addNote` / `fetchNotes`, BLoC
  wiring, and a compose UI inside the Notes tab.
