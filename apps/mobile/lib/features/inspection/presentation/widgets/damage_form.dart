import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../domain/entities/inspection_entity.dart';

const _roofMaterials = <String, String>{
  'asphalt_shingle': 'Asphalt shingle',
  'metal': 'Metal',
  'tile': 'Tile',
  'flat': 'Flat',
  'other': 'Other',
};

const _affectedAreas = <String, String>{
  'roof': 'Roof',
  'gutters': 'Gutters',
  'siding': 'Siding',
  'windows': 'Windows',
  'hvac': 'HVAC',
  'chimney': 'Chimney',
  'skylights': 'Skylights',
  'garage': 'Garage',
  'fence': 'Fence',
  'other': 'Other',
};

class DamageForm extends StatefulWidget {
  final DamageFormData initial;
  final ValueChanged<DamageFormData> onChanged;

  const DamageForm({
    super.key,
    required this.initial,
    required this.onChanged,
  });

  @override
  State<DamageForm> createState() => _DamageFormState();
}

class _DamageFormState extends State<DamageForm> {
  late DamageFormData _data;
  late final TextEditingController _ageCtrl;
  late final TextEditingController _notesCtrl;

  @override
  void initState() {
    super.initState();
    _data = widget.initial;
    _ageCtrl = TextEditingController(
      text: _data.roofAgeYears?.toString() ?? '',
    );
    _notesCtrl = TextEditingController(text: _data.notes ?? '');
  }

  @override
  void dispose() {
    _ageCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _update(DamageFormData next) {
    setState(() => _data = next);
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Section(label: 'Roof age (years)'),
        TextField(
          controller: _ageCtrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            hintText: 'e.g. 18',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (v) {
            final n = int.tryParse(v.trim());
            _update(_data.copyWith(roofAgeYears: () => n));
          },
        ),

        const SizedBox(height: 16),
        _Section(label: 'Roof material *'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in _roofMaterials.entries)
              ChoiceChip(
                label: Text(entry.value),
                selected: _data.roofMaterial == entry.key,
                onSelected: (_) =>
                    _update(_data.copyWith(roofMaterial: () => entry.key)),
              ),
          ],
        ),

        const SizedBox(height: 16),
        _Section(label: 'Storm date'),
        OutlinedButton.icon(
          onPressed: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: _data.stormDate ?? now,
              firstDate: now.subtract(const Duration(days: 365 * 2)),
              lastDate: now,
            );
            if (picked != null) {
              _update(_data.copyWith(stormDate: () => picked));
            }
          },
          icon: const Icon(Icons.calendar_today_outlined, size: 18),
          label: Text(
            _data.stormDate == null
                ? 'Pick date'
                : DateFormat.yMMMd().format(_data.stormDate!),
          ),
        ),

        const SizedBox(height: 16),
        _Section(label: 'Affected areas *'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in _affectedAreas.entries)
              FilterChip(
                label: Text(entry.value),
                selected: _data.affectedAreas.contains(entry.key),
                onSelected: (selected) {
                  final next = [..._data.affectedAreas];
                  if (selected) {
                    if (!next.contains(entry.key)) next.add(entry.key);
                  } else {
                    next.remove(entry.key);
                  }
                  _update(_data.copyWith(affectedAreas: next));
                },
              ),
          ],
        ),

        const SizedBox(height: 16),
        _Section(label: 'Severity *'),
        Row(
          children: [
            for (var i = 1; i <= 5; i++)
              Expanded(
                child: GestureDetector(
                  onTap: () => _update(_data.copyWith(severity: () => i)),
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    height: 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: (_data.severity ?? 0) >= i
                          ? theme.colorScheme.primary
                          : theme.colorScheme.surfaceContainerHighest,
                      border: Border.all(
                        color: theme.colorScheme.outlineVariant,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '$i',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: (_data.severity ?? 0) >= i
                            ? theme.colorScheme.onPrimary
                            : theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),

        const SizedBox(height: 16),
        _Section(label: 'Notes'),
        TextField(
          controller: _notesCtrl,
          minLines: 3,
          maxLines: 6,
          maxLength: 1000,
          decoration: const InputDecoration(
            hintText: 'Scope of work, missing shingles, hidden damage…',
            border: OutlineInputBorder(),
          ),
          onChanged: (v) {
            final t = v.trim();
            _update(_data.copyWith(notes: () => t.isEmpty ? null : t));
          },
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String label;
  const _Section({required this.label});

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
