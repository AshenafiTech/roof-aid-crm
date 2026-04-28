import 'package:flutter/material.dart';

/// Lightweight app-wide theme-mode holder.
///
/// Not persisted yet — this is a temporary hook for the "sun/moon" toggle
/// in the shell's app bar. When the Settings screen lands, replace usage
/// with a SharedPreferences-backed controller and remove the shell toggle.
class ThemeController {
  ThemeController._();

  static final ValueNotifier<ThemeMode> mode = ValueNotifier<ThemeMode>(
    ThemeMode.system,
  );

  /// Flip between light and dark. From `system`, resolves the current
  /// platform brightness and snaps to its opposite so the tap feels like
  /// an immediate visible change.
  static void toggle() {
    switch (mode.value) {
      case ThemeMode.light:
        mode.value = ThemeMode.dark;
      case ThemeMode.dark:
        mode.value = ThemeMode.light;
      case ThemeMode.system:
        final brightness =
            WidgetsBinding.instance.platformDispatcher.platformBrightness;
        mode.value = brightness == Brightness.dark
            ? ThemeMode.light
            : ThemeMode.dark;
    }
  }

  /// Resolve the effective brightness for the current mode, consulting the
  /// platform when `system` is active. Callers use this to pick the right
  /// icon for the toggle button.
  static Brightness resolvedBrightness(BuildContext context) {
    return switch (mode.value) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => MediaQuery.platformBrightnessOf(context),
    };
  }
}
