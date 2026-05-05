import 'package:flutter/material.dart';

import '../../../../../core/constants/prospect_status.dart';
import '../../../../../core/theme/app_theme.dart';
import '../../../domain/entities/prospect_entity.dart';

/// Read-only summary of the core prospect record. All fields come from the
/// already-fetched [ProspectEntity] — no extra queries.
class OverviewTab extends StatelessWidget {
  final ProspectEntity prospect;

  const OverviewTab({super.key, required this.prospect});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = ProspectStatus.color(prospect.status);
    final statusLabel = ProspectStatus.label(prospect.status);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionCard(
          title: 'Status',
          children: [
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  statusLabel,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ],
            ),
          ],
        ),
        _SectionCard(
          title: 'Contact',
          children: [
            _KeyValue(
              icon: Icons.person_outline,
              iconColor: AppTheme.iconPerson,
              label: 'Name',
              value: prospect.name,
            ),
            if (prospect.phones.isNotEmpty)
              _KeyValue(
                icon: Icons.phone_outlined,
                iconColor: AppTheme.iconPhone,
                label: prospect.phones.length > 1 ? 'Phones' : 'Phone',
                value: prospect.phones.join('\n'),
              ),
            if ((prospect.email ?? '').isNotEmpty)
              _KeyValue(
                icon: Icons.email_outlined,
                iconColor: AppTheme.iconEmail,
                label: 'Email',
                value: prospect.email!,
              ),
          ],
        ),
        _SectionCard(
          title: 'Property',
          children: [
            _KeyValue(
              icon: Icons.location_on_outlined,
              iconColor: AppTheme.iconLocation,
              label: 'Address',
              value: _fullAddress(prospect),
            ),
            ..._buildPropertyStatGrid(prospect),
          ],
        ),
        _SectionCard(
          title: 'Record',
          children: [
            _KeyValue(
              icon: Icons.fiber_new_outlined,
              iconColor: AppTheme.iconTimeNew,
              label: 'Created',
              value: _formatDate(prospect.createdAt),
            ),
            _KeyValue(
              icon: Icons.update_outlined,
              iconColor: AppTheme.iconTimeUpdate,
              label: 'Last updated',
              value: _formatDate(prospect.updatedAt),
            ),
          ],
        ),
      ],
    );
  }

  /// Lays out the short "stat" fields (hail, home value, coordinates) in a
  /// 2-column grid. Keeps the Property card compact so the overview fits on
  /// one screen without scrolling. Address stays full-width above this grid
  /// because it's multi-line.
  List<Widget> _buildPropertyStatGrid(ProspectEntity prospect) {
    final stats = <Widget>[
      if (prospect.hailSize != null)
        _StatCell(
          icon: Icons.cloud_outlined,
          iconColor: AppTheme.iconWeather,
          label: 'Hail size',
          value: '${prospect.hailSize!.toStringAsFixed(2)} in',
        ),
      if (prospect.homeValue != null)
        _StatCell(
          icon: Icons.attach_money_outlined,
          iconColor: AppTheme.iconMoney,
          label: 'Home value',
          value: _money(prospect.homeValue!),
        ),
      if (prospect.hasCoordinates)
        _StatCell(
          icon: Icons.my_location_outlined,
          iconColor: AppTheme.iconCoord,
          label: 'Coordinates',
          value:
              '${prospect.latitude!.toStringAsFixed(5)}, ${prospect.longitude!.toStringAsFixed(5)}',
        ),
    ];
    if (stats.isEmpty) return const [];

    final rows = <Widget>[];
    for (var i = 0; i < stats.length; i += 2) {
      rows.add(
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: stats[i]),
              const SizedBox(width: 12),
              Expanded(
                child: i + 1 < stats.length
                    ? stats[i + 1]
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      );
    }
    return rows;
  }

  String _fullAddress(ProspectEntity p) {
    final line1 = p.address ?? '';
    final cityState = [
      p.city,
      p.state,
    ].where((s) => (s ?? '').isNotEmpty).join(', ');
    final tail = [
      cityState,
      p.zip,
    ].where((s) => (s ?? '').isNotEmpty).join(' ');
    final combined = [line1, tail].where((s) => s.isNotEmpty).join('\n');
    return combined.isEmpty ? '—' : combined;
  }

  String _money(double value) {
    // Simple USD formatting — a formal i18n pass lands later.
    final whole = value.toStringAsFixed(0);
    final buf = StringBuffer();
    for (var i = 0; i < whole.length; i++) {
      if (i > 0 && (whole.length - i) % 3 == 0) buf.write(',');
      buf.write(whole[i]);
    }
    return '\$$buf';
  }

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final y = local.year.toString();
    return '$m/$d/$y';
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 8),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

class _KeyValue extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String label;
  final String value;

  const _KeyValue({
    required this.icon,
    required this.label,
    required this.value,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedIconColor = iconColor ?? theme.colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Soft tinted background makes the colored glyph pop without
          // shouting — think "status dot" behind each field.
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: resolvedIconColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 16, color: resolvedIconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact variant of [_KeyValue] used inside the Property card's 2-column
/// grid. Stacks icon+label above the value so each cell fits in a half-width
/// column without wrapping awkwardly.
class _StatCell extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String label;
  final String value;

  const _StatCell({
    required this.icon,
    required this.label,
    required this.value,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedIconColor = iconColor ?? theme.colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: resolvedIconColor),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}
