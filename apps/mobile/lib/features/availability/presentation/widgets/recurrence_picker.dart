import 'package:flutter/material.dart';

import '../../../../core/constants/recurrence_preset.dart';

class RecurrencePicker extends StatelessWidget {
  final RecurrencePreset selected;
  final int weekdayIso;
  final ValueChanged<RecurrencePreset> onChanged;

  const RecurrencePicker({
    super.key,
    required this.selected,
    required this.weekdayIso,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return RadioGroup<RecurrencePreset>(
      groupValue: selected,
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final preset in RecurrencePreset.values)
            RadioListTile<RecurrencePreset>(
              value: preset,
              title: Text(preset.label(weekdayIso: weekdayIso)),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
        ],
      ),
    );
  }
}
