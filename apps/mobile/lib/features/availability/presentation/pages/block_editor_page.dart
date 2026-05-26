import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/availability_kind.dart';
import '../../../../core/constants/block_reason.dart';
import '../../../../core/constants/recurrence_preset.dart';
import '../../../../core/di/injection_container.dart';
import '../../domain/entities/availability_block_entity.dart';
import '../bloc/block_editor_bloc.dart';
import '../bloc/block_editor_event.dart';
import '../bloc/block_editor_state.dart';
import '../widgets/reason_chips.dart';
import '../widgets/recurrence_picker.dart';

class BlockEditorPage extends StatelessWidget {
  /// Edit when non-null; otherwise create.
  final AvailabilityBlockEntity? existing;

  /// Pre-fill start time when launched from a tap on an empty hour cell.
  final DateTime? initialStart;

  const BlockEditorPage({
    super.key,
    this.existing,
    this.initialStart,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider<BlockEditorBloc>(
      create: (_) => sl<BlockEditorBloc>(),
      child: _BlockEditorView(
        existing: existing,
        initialStart: initialStart,
      ),
    );
  }
}

class _BlockEditorView extends StatefulWidget {
  final AvailabilityBlockEntity? existing;
  final DateTime? initialStart;

  const _BlockEditorView({this.existing, this.initialStart});

  @override
  State<_BlockEditorView> createState() => _BlockEditorViewState();
}

class _BlockEditorViewState extends State<_BlockEditorView> {
  late DateTime _date;
  late TimeOfDay _start;
  late TimeOfDay _end;
  late bool _allDay;
  late String? _reason;
  late TextEditingController _notesCtrl;
  late RecurrencePreset _recurrence;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _date = existing.startsAt;
      _start = TimeOfDay.fromDateTime(existing.startsAt);
      _end = TimeOfDay.fromDateTime(existing.endsAt);
      _allDay = existing.allDay;
      _reason = existing.reason ?? BlockReason.personal;
      _notesCtrl = TextEditingController(text: existing.notes ?? '');
      _recurrence = RecurrencePreset.fromRRule(existing.recurrenceRule);
    } else {
      final seed = widget.initialStart ?? _nextHour(DateTime.now());
      _date = DateTime(seed.year, seed.month, seed.day);
      _start = TimeOfDay(hour: seed.hour, minute: seed.minute >= 30 ? 30 : 0);
      final endSeed = seed.add(const Duration(hours: 1));
      _end = TimeOfDay(hour: endSeed.hour, minute: _start.minute);
      _allDay = false;
      _reason = BlockReason.personal;
      _notesCtrl = TextEditingController();
      _recurrence = RecurrencePreset.none;
    }
  }

  static DateTime _nextHour(DateTime t) =>
      DateTime(t.year, t.month, t.day, t.hour + 1, 0);

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  DateTime _composeStarts() {
    if (_allDay) {
      return DateTime(_date.year, _date.month, _date.day, 0, 0);
    }
    return DateTime(_date.year, _date.month, _date.day, _start.hour,
        _start.minute);
  }

  DateTime _composeEnds() {
    if (_allDay) {
      return DateTime(_date.year, _date.month, _date.day, 23, 59);
    }
    return DateTime(_date.year, _date.month, _date.day, _end.hour, _end.minute);
  }

  bool get _isValid {
    if (_reason == null) return false;
    final starts = _composeStarts();
    final ends = _composeEnds();
    if (!ends.isAfter(starts)) return false;
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existing != null;
    return BlocConsumer<BlockEditorBloc, BlockEditorState>(
      listener: (context, state) {
        switch (state) {
          case BlockEditorSaved():
          case BlockEditorDeleted():
            Navigator.of(context).pop(true);
          case BlockEditorError(:final message):
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(message)),
            );
          case _:
            break;
        }
      },
      builder: (context, state) {
        final isSaving = state is BlockEditorSaving;
        return Scaffold(
          appBar: AppBar(
            title: Text(isEditing ? 'Edit block' : 'New block'),
            actions: [
              TextButton(
                onPressed: !isSaving && _isValid ? () => _submit(context) : null,
                child: Text(
                  'Save',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _isValid
                        ? Theme.of(context).colorScheme.primary
                        : null,
                  ),
                ),
              ),
            ],
          ),
          body: AbsorbPointer(
            absorbing: isSaving,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle('When'),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.calendar_today_outlined),
                    title: Text(DateFormat.yMMMMEEEEd().format(_date)),
                    onTap: _pickDate,
                  ),
                  if (!_allDay)
                    Row(
                      children: [
                        Expanded(
                          child: _TimeTile(
                            label: 'Starts',
                            value: _start,
                            onPick: (v) => setState(() => _start = v),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _TimeTile(
                            label: 'Ends',
                            value: _end,
                            onPick: (v) => setState(() => _end = v),
                          ),
                        ),
                      ],
                    ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('All day'),
                    value: _allDay,
                    onChanged: (v) => setState(() => _allDay = v),
                  ),

                  const SizedBox(height: 12),
                  _SectionTitle('Reason'),
                  ReasonChips(
                    selected: _reason,
                    onSelected: (r) => setState(() => _reason = r),
                  ),

                  const SizedBox(height: 16),
                  _SectionTitle('Notes'),
                  TextField(
                    controller: _notesCtrl,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 500,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      hintText: 'Optional',
                    ),
                  ),

                  const SizedBox(height: 16),
                  _SectionTitle('Repeat'),
                  RecurrencePicker(
                    selected: _recurrence,
                    weekdayIso: _date.weekday,
                    onChanged: (v) => setState(() => _recurrence = v),
                  ),

                  const SizedBox(height: 24),
                  if (isEditing)
                    OutlinedButton.icon(
                      onPressed: isSaving
                          ? null
                          : () => _confirmDelete(context),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Delete block'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor:
                            Theme.of(context).colorScheme.error,
                        side: BorderSide(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _submit(BuildContext context) {
    final rrule = _recurrence.toRRule(weekdayIso: _date.weekday);
    context.read<BlockEditorBloc>().add(
          BlockEditorSubmitted(
            existing: widget.existing,
            startsAt: _composeStarts(),
            endsAt: _composeEnds(),
            allDay: _allDay,
            kind: AvailabilityKind.busy,
            reason: _reason,
            notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
            recurrenceRule: rrule,
          ),
        );
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this block?'),
        content: const Text('This time will become available again.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    context
        .read<BlockEditorBloc>()
        .add(BlockEditorDeleteRequested(widget.existing!.id));
  }
}

class _SectionTitle extends StatelessWidget {
  final String label;
  const _SectionTitle(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class _TimeTile extends StatelessWidget {
  final String label;
  final TimeOfDay value;
  final ValueChanged<TimeOfDay> onPick;

  const _TimeTile({
    required this.label,
    required this.value,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final picked = await showTimePicker(
          context: context,
          initialTime: value,
        );
        if (picked != null) onPick(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 2),
            Text(
              value.format(context),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
