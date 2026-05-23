import 'package:flutter/material.dart';

import '../../../../core/constants/block_reason.dart';

class ReasonChips extends StatelessWidget {
  final String? selected;
  final ValueChanged<String> onSelected;

  const ReasonChips({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final reason in BlockReason.all)
          ChoiceChip(
            label: Text(BlockReason.label(reason)),
            selected: selected == reason,
            onSelected: (_) => onSelected(reason),
          ),
      ],
    );
  }
}
