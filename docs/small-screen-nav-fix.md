# Small-screen & easy-mode navigation fix

## Problem

On phones with "Easy Mode" or large accessibility text sizes enabled (Samsung, Xiaomi, etc.), the system `textScaler` can reach 1.5–2×. This caused two issues:

1. `NavigationBar` labels grew too large, overflowing horizontally and distorting the bar height.
2. `AppBar` action labels and title could overflow on narrow phones.

## Fixes

### 1. Text scale cap — `lib/app.dart`

Added a `builder` to `MaterialApp.router` that wraps the whole app in a `MediaQuery` with `textScaler` clamped to **1.3× maximum**:

```dart
builder: (context, child) {
  final mq = MediaQuery.of(context);
  return MediaQuery(
    data: mq.copyWith(
      textScaler: mq.textScaler.clamp(
        minScaleFactor: 1.0,
        maxScaleFactor: 1.3,
      ),
    ),
    child: child!,
  );
},
```

- 1.3× still respects the user's preference (text is noticeably bigger than default).
- Prevents layout-breaking growth in fixed-height shell widgets.
- Applies app-wide — every screen benefits automatically.

### 2. Smaller, lighter NavigationBar labels — `lib/core/theme/app_theme.dart`

The `NavigationBarThemeData.labelTextStyle` was tuned to a smaller base size so the 1.3× clamp still fits inside the 72 dp bar:

| Property | Before | After |
|---|---|---|
| `fontSize` | 11 | **10** |
| `fontWeight` (selected) | `w700` | **`w600`** |
| `fontWeight` (unselected) | `w600` | **`w500`** |

- Math: 10 sp × 1.3 = 13 sp effective max — comfortable inside the bar with no overflow.
- All five labels stay visible at all times (we tried `onlyShowSelected` and reverted it — full labels are friendlier for new users).
- Convention used by Gmail, Google Photos, and most modern Material 3 apps with 5-item bottom bars: small + light + always visible.

## Why not clamp lower (e.g. 1.15×)?

1.3× is the sweet spot: it allows genuine accessibility benefit (visually-impaired users who rely on slightly larger text) while stopping short of the extreme sizes that break fixed-height shell chrome. The Google I/O and Flutter documentation community consensus is 1.2–1.4× as a safe ceiling for apps with dense navigation.

## What this does NOT fix

- Very small physical screen widths (< 320 dp) — the 5-tab bar still gets tight at that size even with icon-only tabs. If the client ever needs to support < 360 dp devices, consider reducing to 4 tabs or moving Settings to a drawer.
- Display size (DPI scale) set to "large" in Android settings — this changes logical pixels, not text scale, and requires responsive layout breakpoints rather than textScaler clamping.
