import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/glass_surface.dart';
import '../../domain/entities/prospect_entity.dart';

/// Bottom action bar for the prospect detail page.
///
/// In M3 these actions hand off to native apps — the phone dialer, the
/// Messages app, and the user's default maps app. Telnyx in-app calling
/// and messaging land in M4; this deliberate hand-off keeps field Ruferos
/// on hardware that already works (speakerphone, bluetooth headset, etc.).
class QuickActionsBar extends StatelessWidget {
  final ProspectEntity prospect;

  const QuickActionsBar({super.key, required this.prospect});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // final canContact = !prospect.doNotCall;
    final phone = prospect.primaryPhone;
    final hasPhone = phone != null && phone.isNotEmpty;
    final hasCoords = prospect.hasCoordinates;

    // Uniform shape/padding so all three buttons share the same footprint —
    // prevents the longer "Navigate" label from wrapping while "Call"/"SMS"
    // don't. Per-button colors are layered on top for visual distinction.
    ButtonStyle styleFor(Color tint) => FilledButton.styleFrom(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      minimumSize: const Size(0, 44),
      backgroundColor: tint.withValues(alpha: 0.14),
      foregroundColor: tint,
    );

    return DecoratedBox(
      // Soft top-edge shadow so the bar "floats" over scrolling content.
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.primary.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: GlassSurface(
        tintOpacity: 0.85,
        blurSigma: 28,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.tonalIcon(
                    style: styleFor(AppTheme.iconPhone),
                    icon: const Icon(Icons.phone, size: 18),
                    label: const _ActionLabel('Call'),
                    onPressed: (hasPhone)
                        ? () => _dial(context, phone)
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonalIcon(
                    style: styleFor(AppTheme.iconSms),
                    icon: const Icon(Icons.sms_outlined, size: 18),
                    label: const _ActionLabel('SMS'),
                    onPressed: (hasPhone)
                        ? () => _sms(context, phone)
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonalIcon(
                    style: styleFor(AppTheme.iconNav),
                    icon: const Icon(Icons.directions, size: 18),
                    label: const _ActionLabel('Navigate'),
                    onPressed: hasCoords
                        ? () => _navigate(
                            context,
                            prospect.latitude!,
                            prospect.longitude!,
                            prospect.name,
                          )
                        : null,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _dial(BuildContext context, String phone) async {
    await _launch(
      ScaffoldMessenger.of(context),
      Uri(scheme: 'tel', path: phone),
      failMessage: 'No dialer app available',
    );
  }

  Future<void> _sms(BuildContext context, String phone) async {
    await _launch(
      ScaffoldMessenger.of(context),
      Uri(scheme: 'sms', path: phone),
      failMessage: 'No messaging app available',
    );
  }

  Future<void> _navigate(
    BuildContext context,
    double lat,
    double lng,
    String label,
  ) async {
    // Capture messenger before any async gap — otherwise the analyzer
    // (rightly) warns about using BuildContext across awaits.
    final messenger = ScaffoldMessenger.of(context);

    // `geo:` with a query is the Android-standard way to open any maps app.
    // iOS ignores `geo:`, so we fall back to a universal Google Maps URL.
    final geo = Uri.parse(
      'geo:$lat,$lng?q=$lat,$lng(${Uri.encodeComponent(label)})',
    );
    final fallback = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
    );

    if (await canLaunchUrl(geo)) {
      await launchUrl(geo);
      return;
    }
    await _launch(
      messenger,
      fallback,
      failMessage: 'No maps app available',
      mode: LaunchMode.externalApplication,
    );
  }

  Future<void> _launch(
    ScaffoldMessengerState messenger,
    Uri uri, {
    required String failMessage,
    LaunchMode mode = LaunchMode.platformDefault,
  }) async {
    final ok = await launchUrl(uri, mode: mode);
    if (!ok) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(failMessage)));
    }
  }
}

/// Single-line button label that scales down on narrow phones instead of
/// wrapping to two lines. Every action in the bar uses this so they stay
/// visually uniform.
class _ActionLabel extends StatelessWidget {
  final String text;

  const _ActionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}
