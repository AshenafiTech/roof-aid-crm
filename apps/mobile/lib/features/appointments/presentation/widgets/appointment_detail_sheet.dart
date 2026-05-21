import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/appointment_status.dart';
import '../../domain/entities/appointment_entity.dart';

/// Bottom sheet shown when a rufero taps an appointment card.
/// Pure UI — the caller wires the actions (Start Inspection / Mark
/// complete / No-show), which keeps this sheet reusable from the
/// Schedule tab (dispatches to [AppointmentsBloc]) and from the
/// prospect-detail Appointments tab (calls the transition use case
/// directly + refreshes its own list).
class AppointmentDetailSheet extends StatelessWidget {
  final AppointmentEntity appointment;
  final VoidCallback? onStartInspection;
  final VoidCallback? onMarkComplete;
  final ValueChanged<String>? onMarkNoShow;

  const AppointmentDetailSheet({
    super.key,
    required this.appointment,
    this.onStartInspection,
    this.onMarkComplete,
    this.onMarkNoShow,
  });

  static Future<void> show(
    BuildContext context, {
    required AppointmentEntity appointment,
    VoidCallback? onStartInspection,
    VoidCallback? onMarkComplete,
    ValueChanged<String>? onMarkNoShow,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => AppointmentDetailSheet(
        appointment: appointment,
        onStartInspection: onStartInspection,
        onMarkComplete: onMarkComplete,
        onMarkNoShow: onMarkNoShow,
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
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
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
            if (canComplete &&
                appointment.canStartInspection &&
                onStartInspection != null) ...[
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
            if (canComplete && onMarkComplete != null)
              OutlinedButton.icon(
                onPressed: () => _confirmComplete(context),
                icon: const Icon(Icons.check),
                label: const Text('Mark complete'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                ),
              ),
            const SizedBox(height: 8),
            if (canComplete && onMarkNoShow != null)
              OutlinedButton.icon(
                onPressed: () => _markNoShow(context),
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
        ),
      ),
    );
  }

  Future<void> _confirmComplete(BuildContext context) async {
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
    Navigator.of(context).pop();
    onMarkComplete?.call();
  }

  Future<void> _markNoShow(BuildContext context) async {
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
    Navigator.of(context).pop();
    onMarkNoShow?.call(reason);
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
