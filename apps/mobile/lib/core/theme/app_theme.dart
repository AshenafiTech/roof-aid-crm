import 'package:flutter/material.dart';

/// Application theme — light + dark counterparts, plus brand/semantic
/// tokens used across the app.
///
/// Palette choices:
///   • Primary (indigo) — high-contrast corporate blue that stays readable
///     in bright outdoor sunlight (field Ruferos).
///   • Secondary (roof-aid orange) — brand accent for call-to-action.
///   • Slate neutrals — modern, clean, accessible at all elevations.
///
/// Liquid-glass / frosted effects are applied at *point-of-use* on
/// floating surfaces (Quick Actions Bar, map count chip) — not globally.
/// Outdoor readability > visual flash.
class AppTheme {
  // ── Brand ──────────────────────────────────────────────────
  static const Color brandPrimary = Color(0xFF1E3A8A); // indigo-800
  static const Color brandPrimaryDark = Color(0xFF1E40AF); // indigo-700
  static const Color brandPrimaryLight = Color(
    0xFF6366F1,
  ); // indigo-500 (dark-mode primary)
  static const Color brandAccent = Color(0xFFE8501F); // roof-aid orange
  static const Color brandAccentSoft = Color(0xFFFFEDD5); // orange-100

  // ── Neutrals (slate scale) ─────────────────────────────────
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate950 = Color(0xFF020617);

  // ── Semantic ───────────────────────────────────────────────
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);
  static const Color danger = Color(0xFFDC2626);

  /// Icon accent palette — use these for leading/trailing icons across
  /// cards and tiles so the UI feels alive instead of washed-out grey.
  /// Values are picked from the tailwind 500-600 range for readability
  /// on both light *and* dark surfaces.
  static const Color iconLocation = Color(0xFF14B8A6); // teal-500
  static const Color iconPhone = Color(0xFF16A34A); // green-600
  static const Color iconEmail = Color(0xFF0891B2); // cyan-600
  static const Color iconPerson = Color(0xFF6366F1); // indigo-500
  static const Color iconMoney = Color(0xFFD97706); // amber-600
  static const Color iconWeather = Color(0xFF0EA5E9); // sky-500
  static const Color iconCoord = Color(0xFF7C3AED); // violet-600
  static const Color iconTimeNew = Color(0xFFEC4899); // pink-500
  static const Color iconTimeUpdate = Color(0xFFF59E0B); // amber-500
  static const Color iconLock = Color(0xFFF59E0B); // amber-500
  static const Color iconNav = Color(0xFF2563EB); // blue-600
  static const Color iconSms = Color(0xFF8B5CF6); // violet-500

  /// Subtle shadow used on cards and elevated tiles — blue-tinted so it
  /// reads as "branded depth" instead of grey fog.
  static List<BoxShadow> get cardShadow => [
    BoxShadow(
      color: brandPrimary.withValues(alpha: 0.06),
      blurRadius: 12,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: slate900.withValues(alpha: 0.04),
      blurRadius: 2,
      offset: const Offset(0, 1),
    ),
  ];

  static ThemeData get light => _build(_lightColors, _LightTokens());

  static ThemeData get dark => _build(_darkColors, _DarkTokens());

  // ── Color schemes ─────────────────────────────────────────
  static const ColorScheme _lightColors = ColorScheme(
    brightness: Brightness.light,
    primary: brandPrimary,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFDBEAFE),
    onPrimaryContainer: Color(0xFF1E3A8A),
    secondary: brandAccent,
    onSecondary: Colors.white,
    secondaryContainer: brandAccentSoft,
    onSecondaryContainer: Color(0xFF7C2D12),
    tertiary: Color(0xFF0891B2),
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFCFFAFE),
    onTertiaryContainer: Color(0xFF155E75),
    error: danger,
    onError: Colors.white,
    errorContainer: Color(0xFFFEE2E2),
    onErrorContainer: Color(0xFF7F1D1D),
    surface: Colors.white,
    onSurface: slate900,
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: slate50,
    surfaceContainer: slate100,
    surfaceContainerHigh: slate200,
    surfaceContainerHighest: slate200,
    onSurfaceVariant: slate600,
    outline: slate300,
    outlineVariant: slate200,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: slate900,
    onInverseSurface: slate50,
    inversePrimary: Color(0xFF93C5FD),
  );

  static const ColorScheme _darkColors = ColorScheme(
    brightness: Brightness.dark,
    primary: brandPrimaryLight,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFF1E3A8A),
    onPrimaryContainer: Color(0xFFDBEAFE),
    secondary: Color(0xFFFB923C), // orange-400 — brighter for dark bg
    onSecondary: slate900,
    secondaryContainer: Color(0xFF7C2D12),
    onSecondaryContainer: brandAccentSoft,
    tertiary: Color(0xFF22D3EE), // cyan-400
    onTertiary: slate900,
    tertiaryContainer: Color(0xFF155E75),
    onTertiaryContainer: Color(0xFFCFFAFE),
    error: Color(0xFFF87171),
    onError: slate900,
    errorContainer: Color(0xFF7F1D1D),
    onErrorContainer: Color(0xFFFEE2E2),
    surface: slate900,
    onSurface: Color(0xFFF1F5F9),
    surfaceContainerLowest: slate950,
    surfaceContainerLow: slate900,
    surfaceContainer: slate800,
    surfaceContainerHigh: slate700,
    surfaceContainerHighest: slate600,
    onSurfaceVariant: slate300,
    outline: slate600,
    outlineVariant: slate700,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: slate50,
    onInverseSurface: slate900,
    inversePrimary: brandPrimary,
  );

  static ThemeData _build(ColorScheme colorScheme, _ModeTokens t) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      fontFamily: 'Roboto',
      scaffoldBackgroundColor: t.scaffoldBg,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        backgroundColor: colorScheme.surface,
        surfaceTintColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: colorScheme.onSurface,
          letterSpacing: -0.3,
        ),
        iconTheme: IconThemeData(color: colorScheme.onSurface, size: 22),
      ),
      cardTheme: CardThemeData(
        elevation: 1.5,
        color: colorScheme.surface,
        surfaceTintColor: colorScheme.surface,
        shadowColor: colorScheme.primary.withValues(alpha: 0.15),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: colorScheme.outlineVariant.withValues(alpha: 0.8),
          ),
        ),
        margin: EdgeInsets.zero,
      ),
      navigationBarTheme: NavigationBarThemeData(
        elevation: 0,
        height: 72,
        backgroundColor: colorScheme.surface,
        surfaceTintColor: colorScheme.surface,
        indicatorColor: colorScheme.primary.withValues(alpha: 0.12),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected
                ? colorScheme.primary
                : colorScheme.onSurfaceVariant,
            letterSpacing: 0.2,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 24,
            color: selected
                ? colorScheme.primary
                : colorScheme.onSurfaceVariant,
          );
        }),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
          elevation: 0,
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colorScheme.primary,
        unselectedLabelColor: colorScheme.onSurfaceVariant,
        indicatorColor: colorScheme.primary,
        indicatorSize: TabBarIndicatorSize.label,
        labelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
        dividerColor: colorScheme.outlineVariant,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: WidgetStateProperty.all(
            const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
            ),
          ),
          side: WidgetStateProperty.all(BorderSide(color: colorScheme.outline)),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colorScheme.surfaceContainer,
        side: BorderSide(color: colorScheme.outlineVariant),
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: colorScheme.onSurface,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.inputFill,
        labelStyle: TextStyle(
          color: colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w500,
        ),
        floatingLabelStyle: TextStyle(
          color: colorScheme.primary,
          fontWeight: FontWeight.w600,
        ),
        hintStyle: TextStyle(color: colorScheme.onSurfaceVariant),
        prefixIconColor: colorScheme.onSurfaceVariant,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.error, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      dividerTheme: DividerThemeData(
        color: colorScheme.outlineVariant,
        thickness: 1,
        space: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: t.snackBarBg,
        contentTextStyle: TextStyle(
          color: t.snackBarFg,
          fontWeight: FontWeight.w500,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colorScheme.surface,
        surfaceTintColor: colorScheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: colorScheme.surface,
        surfaceTintColor: colorScheme.surface,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: colorScheme.outlineVariant),
        ),
      ),
    );
  }
}

// ── Mode-scoped tokens that don't map cleanly to ColorScheme ───────
abstract class _ModeTokens {
  Color get scaffoldBg;
  Color get inputFill;
  Color get snackBarBg;
  Color get snackBarFg;
}

class _LightTokens implements _ModeTokens {
  @override
  Color get scaffoldBg => AppTheme.slate50;
  @override
  Color get inputFill => AppTheme.slate50;
  @override
  Color get snackBarBg => AppTheme.slate900;
  @override
  Color get snackBarFg => Colors.white;
}

class _DarkTokens implements _ModeTokens {
  @override
  Color get scaffoldBg => AppTheme.slate950;
  @override
  Color get inputFill => AppTheme.slate800;
  @override
  Color get snackBarBg => AppTheme.slate100;
  @override
  Color get snackBarFg => AppTheme.slate900;
}
