import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/working_hours_entity.dart';
import '../bloc/working_hours_bloc.dart';
import '../bloc/working_hours_event.dart';
import '../bloc/working_hours_state.dart';

class WorkingHoursPage extends StatelessWidget {
  const WorkingHoursPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider<WorkingHoursBloc>(
      create: (_) => sl<WorkingHoursBloc>()
        ..add(const WorkingHoursLoadRequested()),
      child: const _WorkingHoursView(),
    );
  }
}

class _WorkingHoursView extends StatefulWidget {
  const _WorkingHoursView();

  @override
  State<_WorkingHoursView> createState() => _WorkingHoursViewState();
}

class _WorkingHoursViewState extends State<_WorkingHoursView> {
  WorkingHoursEntity? _working;
  static const _dayLabels = {
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday',
  };

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<WorkingHoursBloc, WorkingHoursState>(
      listener: (context, state) {
        if (state is WorkingHoursLoaded) {
          setState(() => _working = state.hours);
        } else if (state is WorkingHoursError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message)),
          );
        }
      },
      builder: (context, state) {
        final saving =
            state is WorkingHoursLoaded ? state.isSaving : false;
        final loading = state is WorkingHoursLoading;
        final working = _working;
        return Scaffold(
          appBar: AppBar(
            title: const Text('My working hours'),
            actions: [
              TextButton(
                onPressed: working == null || saving
                    ? null
                    : () => context.read<WorkingHoursBloc>().add(
                          WorkingHoursSubmitted(
                            working.copyWith(inherited: false),
                          ),
                        ),
                child: Text(
                  saving ? 'Saving…' : 'Save',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ),
            ],
          ),
          body: loading || working == null
              ? const Center(child: CircularProgressIndicator())
              : _body(working, saving),
        );
      },
    );
  }

  Widget _body(WorkingHoursEntity working, bool saving) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (working.inherited)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer
                      .withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Using your tenant default. Edit any day to set a personal override.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            for (final key in WorkingHoursEntity.orderedDayKeys)
              _DayRow(
                label: _dayLabels[key]!,
                window: working.byDay[key],
                onChanged: (window) {
                  setState(() {
                    final next = {...working.byDay, key: window};
                    _working = working.copyWith(
                      byDay: next,
                      inherited: false,
                    );
                  });
                },
              ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: saving
                  ? null
                  : () => context
                      .read<WorkingHoursBloc>()
                      .add(const WorkingHoursResetRequested()),
              icon: const Icon(Icons.restart_alt),
              label: const Text('Reset to tenant default'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  final String label;
  final DayWindow? window;
  final ValueChanged<DayWindow?> onChanged;

  const _DayRow({
    required this.label,
    required this.window,
    required this.onChanged,
  });

  TimeOfDay _parse(String hhmm) {
    final parts = hhmm.split(':');
    return TimeOfDay(
      hour: int.parse(parts[0]),
      minute: int.parse(parts[1]),
    );
  }

  String _format(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          if (window == null) ...[
            Expanded(
              child: Text(
                'Off',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            TextButton.icon(
              onPressed: () => onChanged(
                const DayWindow(start: '08:00', end: '17:00'),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Set hours'),
            ),
          ] else ...[
            Expanded(
              child: Row(
                children: [
                  _Picker(
                    value: _parse(window!.start),
                    onPicked: (t) => onChanged(
                      DayWindow(start: _format(t), end: window!.end),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 6),
                    child: Text('—'),
                  ),
                  _Picker(
                    value: _parse(window!.end),
                    onPicked: (t) => onChanged(
                      DayWindow(start: window!.start, end: _format(t)),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Mark Off',
              icon: const Icon(Icons.close, size: 20),
              onPressed: () => onChanged(null),
            ),
          ],
        ],
      ),
    );
  }
}

class _Picker extends StatelessWidget {
  final TimeOfDay value;
  final ValueChanged<TimeOfDay> onPicked;
  const _Picker({required this.value, required this.onPicked});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final picked =
            await showTimePicker(context: context, initialTime: value);
        if (picked != null) onPicked(picked);
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        child: Text(
          value.format(context),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
