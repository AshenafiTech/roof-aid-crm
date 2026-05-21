import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/constants/appointment_status.dart';
import '../../../../../core/di/injection_container.dart';
import '../../../../appointments/domain/entities/appointment_entity.dart';
import '../../../../appointments/domain/usecases/get_prospect_appointments.dart';
import '../../../../appointments/domain/usecases/transition_appointment.dart';
import '../../../../appointments/presentation/widgets/appointment_detail_sheet.dart';
import '../../../../inspection/presentation/pages/inspection_page.dart';
import '../../../domain/entities/prospect_entity.dart';
import '../empty_state.dart';

/// "Appointments" tab on the prospect detail page.
///
/// Lists every appointment this prospect has (RLS gates per role —
/// a rufero sees only their own, admin/telefonista/owner see all).
/// Tapping a card opens [AppointmentDetailSheet] with the same
/// actions as the Schedule tab (Start Inspection / Mark complete /
/// No-show), gated by status + the `canStartInspection` rule.
class AppointmentsTab extends StatefulWidget {
  final ProspectEntity prospect;

  const AppointmentsTab({super.key, required this.prospect});

  @override
  State<AppointmentsTab> createState() => _AppointmentsTabState();
}

class _AppointmentsTabState extends State<AppointmentsTab> {
  late Future<List<AppointmentEntity>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<AppointmentEntity>> _load() async {
    final useCase = sl<GetProspectAppointments>();
    final result = await useCase(widget.prospect.id);
    return result.fold(
      (failure) => throw _LoadError(failure.message),
      (list) => list,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future.catchError((_) => <AppointmentEntity>[]);
  }

  Future<void> _openSheet(AppointmentEntity a) async {
    await AppointmentDetailSheet.show(
      context,
      appointment: a,
      onStartInspection: () async {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => InspectionPage(
              appointmentId: a.id,
              prospectId: a.prospectId,
              prospectName: a.prospectName,
              scheduledAt: a.scheduledAt,
            ),
          ),
        );
        if (mounted) _refresh();
      },
      onMarkComplete: () => _transition(
        a.id,
        AppointmentStatus.completed,
      ),
      onMarkNoShow: (reason) => _transition(
        a.id,
        AppointmentStatus.noShow,
        reason: reason,
      ),
    );
  }

  Future<void> _transition(
    String appointmentId,
    String to, {
    String? reason,
  }) async {
    final useCase = sl<TransitionAppointment>();
    final result = await useCase(
      appointmentId: appointmentId,
      to: to,
      reason: reason,
    );
    if (!mounted) return;
    result.fold(
      (failure) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(failure.message)));
      },
      (_) => _refresh(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<AppointmentEntity>>(
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
        final appts = snap.data ?? const <AppointmentEntity>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: _Body(appointments: appts, onTap: _openSheet),
        );
      },
    );
  }
}

class _Body extends StatelessWidget {
  final List<AppointmentEntity> appointments;
  final ValueChanged<AppointmentEntity> onTap;

  const _Body({required this.appointments, required this.onTap});

  @override
  Widget build(BuildContext context) {
    if (appointments.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 48),
          EmptyState(
            icon: Icons.event_outlined,
            title: 'No appointments yet',
            description:
                'Once a Telefonista books an inspection for this prospect, '
                'it will show up here.',
          ),
        ],
      );
    }

    // Split into upcoming / past for clarity. The list is already
    // newest-first (scheduled_at desc) from the repo — partition by
    // "is this in the future?" relative to now.
    final now = DateTime.now();
    final upcoming = <AppointmentEntity>[];
    final past = <AppointmentEntity>[];
    for (final a in appointments) {
      if (a.scheduledAt.isAfter(now) &&
          !AppointmentStatus.terminal.contains(a.status)) {
        upcoming.add(a);
      } else {
        past.add(a);
      }
    }
    // Upcoming should be earliest-first so "next" sits at the top.
    upcoming.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        if (upcoming.isNotEmpty) ...[
          _SectionLabel('Upcoming'),
          for (final a in upcoming)
            _AppointmentCard(appointment: a, onTap: () => onTap(a)),
        ],
        if (past.isNotEmpty) ...[
          const SizedBox(height: 16),
          _SectionLabel('Past'),
          for (final a in past)
            _AppointmentCard(appointment: a, onTap: () => onTap(a)),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 4, 0, 8),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 1.0,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}

class _AppointmentCard extends StatelessWidget {
  final AppointmentEntity appointment;
  final VoidCallback onTap;

  const _AppointmentCard({required this.appointment, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final statusColor = AppointmentStatus.color(appointment.status);
    final statusLabel = AppointmentStatus.label(appointment.status);
    final dateText =
        DateFormat.yMMMMEEEEd().format(appointment.scheduledAt);
    final timeText =
        '${DateFormat.jm().format(appointment.scheduledAt)} · ${appointment.durationMinutes} min';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: cs.outlineVariant),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left status bar.
                Container(
                  width: 4,
                  height: 64,
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              dateText,
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          _StatusChip(status: appointment.status, label: statusLabel),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        timeText,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      if (appointment.ruferoName != null) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(
                              Icons.person_outline,
                              size: 14,
                              color: cs.onSurfaceVariant,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                appointment.ruferoName!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: cs.onSurfaceVariant,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      if ((appointment.notes ?? '').isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          appointment.notes!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: cs.onSurfaceVariant,
                            fontStyle: FontStyle.italic,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      if ((appointment.cancellationReason ?? '').isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Reason: ${appointment.cancellationReason}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: cs.error,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.chevron_right,
                  size: 22,
                  color: cs.onSurfaceVariant.withValues(alpha: 0.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  final String label;
  const _StatusChip({required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    final color = AppointmentStatus.color(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
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
