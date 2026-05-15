import 'package:flutter/material.dart';

import '../../../../core/constants/photo_tags.dart';

/// Multi-select chip picker grouped by category. Required: at least one tag.
class PhotoTagSelector extends StatelessWidget {
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;

  const PhotoTagSelector({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final entry in PhotoTags.groups.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: Text(
              entry.key,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final tag in entry.value)
                FilterChip(
                  label: Text(PhotoTags.label(tag)),
                  selected: selected.contains(tag),
                  onSelected: (v) {
                    final next = {...selected};
                    if (v) {
                      next.add(tag);
                    } else {
                      next.remove(tag);
                    }
                    onChanged(next);
                  },
                ),
            ],
          ),
        ],
      ],
    );
  }
}
