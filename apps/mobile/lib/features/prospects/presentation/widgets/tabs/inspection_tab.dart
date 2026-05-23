import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/di/injection_container.dart';
import '../../../../inspection/domain/entities/inspection_entity.dart';
import '../../../../inspection/domain/usecases/get_prospect_inspections.dart';
import '../../../../inspection/presentation/pages/inspection_page.dart';
import '../../../domain/entities/prospect_entity.dart';
import '../empty_state.dart';

// Re-enabling the commented-out "Start Inspection" CTA further down
// requires re-adding these imports:
//   package:flutter_bloc/flutter_bloc.dart
//   ../../../../auth/presentation/bloc/auth_bloc.dart
//   ../../../../auth/presentation/bloc/auth_state.dart
//   ../../../../inspection/domain/usecases/start_ad_hoc_inspection.dart

/// "Inspection" tab on the prospect detail page.
///
/// Lists every inspection that exists for this prospect (in-progress
/// + completed). The rufero taps a card to resume an in-progress
/// inspection or review a completed one. The page no longer doubles
/// as a "Start new ad-hoc inspection" entry — the canonical entry is
/// the Schedule tab → appointment → Start Inspection. The Start CTA
/// is kept here, commented, in case we want to re-enable walk-ins.
class InspectionTab extends StatefulWidget {
  final ProspectEntity prospect;

  const InspectionTab({super.key, required this.prospect});

  @override
  State<InspectionTab> createState() => _InspectionTabState();
}

class _InspectionTabState extends State<InspectionTab> {
  late Future<List<InspectionEntity>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<InspectionEntity>> _load() async {
    final useCase = sl<GetProspectInspections>();
    final result = await useCase(widget.prospect.id);
    return result.fold((failure) => throw _LoadError(failure.message), (list) => list);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future.catchError((_) => <InspectionEntity>[]);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<InspectionEntity>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          final msg = snap.error is _LoadError
              ? (snap.error as _LoadError).message
              : snap.error.toString();
          return _ErrorView(message: msg, onRetry: _refresh);
        }
        final inspections = snap.data ?? const <InspectionEntity>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: _Body(
            inspections: inspections,
            prospect: widget.prospect,
          ),
        );
      },
    );
  }
}

class _Body extends StatelessWidget {
  final List<InspectionEntity> inspections;
  final ProspectEntity prospect;

  const _Body({required this.inspections, required this.prospect});

  @override
  Widget build(BuildContext context) {
    if (inspections.isEmpty) {
      // ListView so pull-to-refresh works even on the empty state.
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 48),
          EmptyState(
            icon: Icons.home_repair_service_outlined,
            title: 'No inspections yet',
            description:
                'Inspections will appear here once a rufero starts one from their Schedule tab.',
          ),
          SizedBox(height: 24),
          // ── COMMENTED: ad-hoc "Start Inspection" CTA ─────────────
          // Kept here for when we decide to re-enable walk-in inspections
          // straight from the prospect detail page. To re-enable:
          //  1. Uncomment the _StartInspectionCta widget below
          //  2. Restore the role gate above
          //
          // _StartInspectionCta(prospect: prospect),
          // ─────────────────────────────────────────────────────────
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: inspections.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) => _InspectionCard(
        inspection: inspections[i],
        prospect: prospect,
      ),
    );
  }
}

class _InspectionCard extends StatelessWidget {
  final InspectionEntity inspection;
  final ProspectEntity prospect;

  const _InspectionCard({required this.inspection, required this.prospect});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final completed = inspection.isCompleted;
    final statusColor = completed ? cs.primary : cs.tertiary;
    final statusLabel = completed ? 'Completed' : 'In progress';
    final actionLabel = completed ? 'View inspection' : 'Continue inspection';
    final actionIcon =
        completed ? Icons.visibility_outlined : Icons.play_arrow_rounded;
    final dateText = DateFormat.yMMMMd().add_jm().format(inspection.createdAt);

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: cs.outlineVariant),
      ),
      child: InkWell(
        onTap: () => _openInspection(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
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
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: statusColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.chevron_right,
                    size: 22,
                    color: cs.onSurfaceVariant.withValues(alpha: 0.5),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                dateText,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 6),
              _MetaRow(
                icon: Icons.layers_outlined,
                label: inspection.roofMaterial == null
                    ? '— material not set'
                    : _materialLabel(inspection.roofMaterial!),
              ),
              if (inspection.severity != null) ...[
                const SizedBox(height: 4),
                _MetaRow(
                  icon: Icons.warning_amber_outlined,
                  label: 'Severity ${inspection.severity}/5',
                ),
              ],
              if (inspection.affectedAreas.isNotEmpty) ...[
                const SizedBox(height: 4),
                _MetaRow(
                  icon: Icons.crisis_alert_outlined,
                  label:
                      'Areas: ${inspection.affectedAreas.length} affected',
                ),
              ],
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: () => _openInspection(context),
                  icon: Icon(actionIcon, size: 18),
                  label: Text(actionLabel),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openInspection(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => InspectionPage(
          appointmentId: inspection.appointmentId,
          prospectId: prospect.id,
          prospectName: prospect.name,
          // We don't carry the appointment scheduled_at here — show the
          // inspection's created date as header context.
          scheduledAt: inspection.createdAt,
        ),
      ),
    );
  }

  String _materialLabel(String key) {
    switch (key) {
      case 'asphalt_shingle':
        return 'Asphalt shingle';
      case 'metal':
        return 'Metal';
      case 'tile':
        return 'Tile';
      case 'flat':
        return 'Flat';
      case 'other':
        return 'Other';
      default:
        return key;
    }
  }
}

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MetaRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: theme.colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _LoadError implements Exception {
  final String message;
  _LoadError(this.message);
  @override
  String toString() => message;
}

// ─────────────────────────────────────────────────────────────────
// COMMENTED: ad-hoc "Start Inspection" CTA + role gate.
// Re-enable by:
//   1. Uncommenting this widget
//   2. Restoring the `auth + role + assignment gate` block inside
//      _InspectionTabState.build (see git history pre-this-change)
//   3. Adding `_StartInspectionCta(prospect: prospect)` somewhere in
//      _Body (e.g. above the list or in the empty state)
// ─────────────────────────────────────────────────────────────────
//
// class _StartInspectionCta extends StatefulWidget {
//   final ProspectEntity prospect;
//   const _StartInspectionCta({required this.prospect});
//
//   @override
//   State<_StartInspectionCta> createState() => _StartInspectionCtaState();
// }
//
// class _StartInspectionCtaState extends State<_StartInspectionCta> {
//   bool _starting = false;
//
//   @override
//   Widget build(BuildContext context) {
//     final authState = context.watch<AuthBloc>().state;
//     if (authState is! AuthAuthenticated) return const SizedBox.shrink();
//     if (authState.user.role != 'rufero') return const SizedBox.shrink();
//     final assignedTo = widget.prospect.assignedTo;
//     if (assignedTo != null && assignedTo != authState.user.id) {
//       return const SizedBox.shrink();
//     }
//     return Padding(
//       padding: const EdgeInsets.all(24),
//       child: FilledButton.icon(
//         onPressed: _starting ? null : _onStart,
//         icon: _starting
//             ? const SizedBox(
//                 width: 18,
//                 height: 18,
//                 child: CircularProgressIndicator(
//                   strokeWidth: 2,
//                   color: Colors.white,
//                 ),
//               )
//             : const Icon(Icons.play_arrow_rounded),
//         label: Text(_starting ? 'Starting…' : 'Start Inspection'),
//       ),
//     );
//   }
//
//   Future<void> _onStart() async {
//     setState(() => _starting = true);
//     final result = await sl<StartAdHocInspection>()(
//       prospectId: widget.prospect.id,
//     );
//     if (!mounted) return;
//     setState(() => _starting = false);
//     result.fold(
//       (f) => ScaffoldMessenger.of(context).showSnackBar(
//         SnackBar(content: Text(f.message)),
//       ),
//       (start) {
//         Navigator.of(context).push(
//           MaterialPageRoute(
//             builder: (_) => InspectionPage(
//               appointmentId: start.appointmentId,
//               prospectId: widget.prospect.id,
//               prospectName: widget.prospect.name,
//               scheduledAt: DateTime.now(),
//             ),
//           ),
//         );
//       },
//     );
//   }
// }
