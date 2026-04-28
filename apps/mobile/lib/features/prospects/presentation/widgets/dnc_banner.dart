import 'package:flutter/material.dart';

/// Red strip shown at the top of the prospect detail page when doNotCall = true.
/// Makes the DNC status — and the reason, if recorded — unmissable for the Rufero
/// before they tap Call/SMS (which are separately disabled by QuickActionsBar).
class DncBanner extends StatelessWidget {
  final String? reason;

  const DncBanner({super.key, this.reason});

  /// Well-known machine codes we've seen in `prospects.do_not_call_reason`
  /// (mostly from imported seed data). Keep this list short — prefer fixing
  /// the upstream writer over growing the map.
  static const Map<String, String> _knownCodes = {
    'imported_dnc_list': 'Imported from Do-Not-Call list',
    'customer_request': 'Customer requested no contact',
    'wrong_number': 'Wrong number',
    'duplicate': 'Duplicate record',
  };

  /// If [raw] looks like a snake_case code, map it (or humanize by splitting
  /// on underscores). Otherwise return the raw string — it's already prose
  /// an admin typed in.
  static String humanize(String raw) {
    if (!RegExp(r'^[a-z0-9_]+$').hasMatch(raw)) return raw;
    final mapped = _knownCodes[raw];
    if (mapped != null) return mapped;
    return raw
        .split('_')
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1))
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final trimmed = reason?.trim();
    final hasReason = trimmed != null && trimmed.isNotEmpty;
    final display = hasReason ? humanize(trimmed) : null;

    return Material(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              Icons.do_not_disturb_on_outlined,
              color: theme.colorScheme.onErrorContainer,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Do not contact',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.onErrorContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (display != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      display,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                        height: 1.4,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
