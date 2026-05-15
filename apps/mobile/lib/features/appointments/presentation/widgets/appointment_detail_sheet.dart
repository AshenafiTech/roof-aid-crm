import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/appointment_status.dart';
import '../../domain/entities/appointment_entity.dart';
import '../bloc/appointments_bloc.dart';
import '../bloc/appointments_event.dart';

/// Bottom sheet shown when a rufero taps an appointment in the List tab.
/// Surfaces "Mark complete" (which we wire to the inspection flow at the
/// page level) and "No-show" with required reason input.
class AppointmentDetailSheet extends StatelessWidget {
  final AppointmentEntity appointment;
  final VoidCallback? onStartInspection;

  const AppointmentDetailSheet({
    super.key,
    required this.appointment,
    this.onStartInspection,
  });

  static Future<void> show(
    BuildContext context, {
    required AppointmentEntity appointment,
    VoidCallback? onStartInspection,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => AppointmentDetailSheet(
        appointment: appointment,
        onStartInspection: onStartInspection,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = DateFormat.yMMMMEEEEd().format(appointment.scheduledAt);
    final time = DateFormat.jm().format(appointment.scheduledAt);
    final canComplete = appointment.status == AppointmentStatus.confirmed;
    final isTerminal =
        AppointmentStatus.terminal.contains(appointment.status);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            appointment.prospectName,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$date · $time · ${appointment.durationMinutes} min',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (appointment.displayAddress.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              appointment.displayAddress,
              style: theme.textTheme.bodyMedium,
            ),
          ],
          const SizedBox(height: 16),
          _StatusRow(status: appointment.status),
          if (appointment.cancellationReason != null) ...[
            const SizedBox(height: 8),
            Text(
              'Reason: ${appointment.cancellationReason}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 20),
          if (!isTerminal) ...[
            if (canComplete && appointment.canStartInspection) ...[
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  onStartInspection?.call();
                },
                icon: const Icon(Icons.assignment_turned_in_outlined),
                label: const Text('Start Inspection'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (canComplete)
              OutlinedButton.icon(
                onPressed: () =>
                    _confirmComplete(context, appointment),
                icon: const Icon(Icons.check),
                label: const Text('Mark complete'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                ),
              ),
            const SizedBox(height: 8),
            if (canComplete)
              OutlinedButton.icon(
                onPressed: () => _markNoShow(context, appointment),
                icon: const Icon(Icons.event_busy_outlined),
                label: const Text('No-show'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                  foregroundColor: theme.colorScheme.error,
                  side: BorderSide(color: theme.colorScheme.error),
                ),
              ),
          ] else
            Text(
              'No further actions — appointment is ${AppointmentStatus.label(appointment.status).toLowerCase()}.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _confirmComplete(
    BuildContext context,
    AppointmentEntity appt,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Mark complete?'),
        content: const Text(
          'This sets the appointment to Completed and updates the prospect.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Mark complete'),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
    context.read<AppointmentsBloc>().add(
          AppointmentTransitionRequested(
            appointmentId: appt.id,
            to: AppointmentStatus.completed,
          ),
        );
    Navigator.of(context).pop();
  }

  Future<void> _markNoShow(
    BuildContext context,
    AppointmentEntity appt,
  ) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('No-show'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'A short reason is required for the activity log.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'e.g. Homeowner did not answer the door',
                border: OutlineInputBorder(),
              ),
              minLines: 2,
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final v = controller.text.trim();
              if (v.isEmpty) return;
              Navigator.of(dialogCtx).pop(v);
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (reason == null || reason.isEmpty || !context.mounted) return;
    context.read<AppointmentsBloc>().add(
          AppointmentTransitionRequested(
            appointmentId: appt.id,
            to: AppointmentStatus.noShow,
            reason: reason,
          ),
        );
    Navigator.of(context).pop();
  }
}

class _StatusRow extends StatelessWidget {
  final String status;
  const _StatusRow({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppointmentStatus.color(status);
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(
          AppointmentStatus.label(status),
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}
