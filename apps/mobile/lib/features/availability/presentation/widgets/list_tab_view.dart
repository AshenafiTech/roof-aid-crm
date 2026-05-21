import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/appointment_status.dart';
import '../../../appointments/domain/entities/appointment_entity.dart';
import '../../../appointments/presentation/bloc/appointments_bloc.dart';
import '../../../appointments/presentation/bloc/appointments_event.dart';
import '../../../appointments/presentation/bloc/appointments_state.dart';
import '../../../appointments/presentation/widgets/appointment_card.dart';
import '../../../appointments/presentation/widgets/appointment_detail_sheet.dart';
import '../../../inspection/presentation/pages/inspection_page.dart';

/// "Fast scan" presentation of the rufero's assigned appointments,
/// grouped by day. Reads from [AppointmentsBloc] (which is provided
/// at the CalendarPage level so both tabs share one fetch).
class ListTabView extends StatelessWidget {
  const ListTabView({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AppointmentsBloc, AppointmentsState>(
      listener: (context, state) {
        if (state is AppointmentsLoaded && state.lastError != null) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(state.lastError!)));
        }
      },
      builder: (context, state) {
        return switch (state) {
          AppointmentsInitial() ||
          AppointmentsLoading() =>
            const Center(child: CircularProgressIndicator()),
          AppointmentsError(:final message, :final isOffline) =>
            _ErrorView(message: message, isOffline: isOffline),
          AppointmentsLoaded(:final appointments) =>
            _LoadedList(appointments: appointments),
        };
      },
    );
  }
}

class _LoadedList extends StatelessWidget {
  final List<AppointmentEntity> appointments;
  const _LoadedList({required this.appointments});

  @override
  Widget build(BuildContext context) {
    // Hide terminal-state appointments from the rufero's list.
    final upcoming = appointments
        .where((a) => !AppointmentStatus.terminal.contains(a.status))
        .toList()
      ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

    if (upcoming.isEmpty) return const _EmptyList();

    final groups = _groupByDay(upcoming);

    return RefreshIndicator(
      onRefresh: () async {
        final bloc = context.read<AppointmentsBloc>();
        bloc.add(const AppointmentsRefreshRequested());
        await bloc.stream.firstWhere(
          (s) => s is AppointmentsLoaded || s is AppointmentsError,
        );
      },
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 8, bottom: 96),
        itemCount: groups.length,
        itemBuilder: (_, i) {
          final group = groups[i];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  group.label,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              for (final a in group.items)
                AppointmentCard(
                  appointment: a,
                  onTap: () => _openSheet(context, a),
                ),
            ],
          );
        },
      ),
    );
  }

  void _openSheet(BuildContext context, AppointmentEntity a) {
    final bloc = context.read<AppointmentsBloc>();
    AppointmentDetailSheet.show(
      context,
      appointment: a,
      onStartInspection: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => InspectionPage(
              appointmentId: a.id,
              prospectId: a.prospectId,
              prospectName: a.prospectName,
              scheduledAt: a.scheduledAt,
            ),
          ),
        );
      },
      onMarkComplete: () => bloc.add(
        AppointmentTransitionRequested(
          appointmentId: a.id,
          to: AppointmentStatus.completed,
        ),
      ),
      onMarkNoShow: (reason) => bloc.add(
        AppointmentTransitionRequested(
          appointmentId: a.id,
          to: AppointmentStatus.noShow,
          reason: reason,
        ),
      ),
    );
  }

  List<_DayGroup> _groupByDay(List<AppointmentEntity> items) {
    final byDay = <DateTime, List<AppointmentEntity>>{};
    for (final a in items) {
      final key = DateTime(
        a.scheduledAt.year,
        a.scheduledAt.month,
        a.scheduledAt.day,
      );
      byDay.putIfAbsent(key, () => []).add(a);
    }
    return byDay.entries
        .map((e) => _DayGroup(label: _label(e.key), items: e.value))
        .toList();
  }

  String _label(DateTime day) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (day == today) return 'Today';
    if (day == today.add(const Duration(days: 1))) return 'Tomorrow';
    return DateFormat.yMMMMEEEEd().format(day);
  }
}

class _DayGroup {
  final String label;
  final List<AppointmentEntity> items;
  _DayGroup({required this.label, required this.items});
}

class _EmptyList extends StatelessWidget {
  const _EmptyList();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 96),
      children: [
        Icon(
          Icons.event_available_outlined,
          size: 64,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: 16),
        Text(
          'No upcoming appointments',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          "When a Telefonista books an inspection for you, it'll show up here.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final bool isOffline;
  const _ErrorView({required this.message, required this.isOffline});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOffline ? Icons.cloud_off_outlined : Icons.error_outline,
              size: 48,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              isOffline ? 'You appear to be offline' : 'Something went wrong',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => context
                  .read<AppointmentsBloc>()
                  .add(const AppointmentsLoadRequested()),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
