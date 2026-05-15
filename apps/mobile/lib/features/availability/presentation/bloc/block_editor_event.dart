import '../../domain/entities/availability_block_entity.dart';

sealed class BlockEditorEvent {
  const BlockEditorEvent();
}

class BlockEditorSubmitted extends BlockEditorEvent {
  /// Null = creating a new block; non-null = editing.
  final AvailabilityBlockEntity? existing;
  final DateTime startsAt;
  final DateTime endsAt;
  final bool allDay;
  final String kind;
  final String? reason;
  final String? notes;
  final String? recurrenceRule;

  const BlockEditorSubmitted({
    this.existing,
    required this.startsAt,
    required this.endsAt,
    required this.kind,
    this.allDay = false,
    this.reason,
    this.notes,
    this.recurrenceRule,
  });
}

class BlockEditorDeleteRequested extends BlockEditorEvent {
  final String blockId;
  const BlockEditorDeleteRequested(this.blockId);
}
