import 'dart:ui';

import 'package:flutter/material.dart';

/// A frosted-glass surface — translucent background with a blur behind it.
///
/// Use sparingly on *floating* elements (bottom bars, chips, snackbars)
/// where the content underneath is visible. Avoid on full-screen backgrounds
/// — outdoor readability matters more than the visual effect.
///
/// Mirrors the iOS 26 "Liquid Glass" look as closely as Flutter's
/// cross-platform blur allows; renders identically on Android.
class GlassSurface extends StatelessWidget {
  final Widget child;
  final BorderRadius borderRadius;
  final double blurSigma;
  final double tintOpacity;
  final Color? tintColor;
  final Border? border;

  const GlassSurface({
    super.key,
    required this.child,
    this.borderRadius = BorderRadius.zero,
    this.blurSigma = 24,
    this.tintOpacity = 0.72,
    this.tintColor,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = (tintColor ?? theme.colorScheme.surface).withValues(
      alpha: tintOpacity,
    );

    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: tint,
            borderRadius: borderRadius,
            border: border,
          ),
          child: child,
        ),
      ),
    );
  }
}
