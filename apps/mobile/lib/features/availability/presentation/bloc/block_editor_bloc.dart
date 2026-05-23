import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/availability_block_entity.dart';
import '../../domain/usecases/create_availability_block.dart';
import '../../domain/usecases/delete_availability_block.dart';
import '../../domain/usecases/update_availability_block.dart';
import 'block_editor_event.dart';
import 'block_editor_state.dart';

class BlockEditorBloc extends Bloc<BlockEditorEvent, BlockEditorState> {
  final CreateAvailabilityBlock _create;
  final UpdateAvailabilityBlock _update;
  final DeleteAvailabilityBlock _delete;

  BlockEditorBloc({
    required CreateAvailabilityBlock create,
    required UpdateAvailabilityBlock update,
    required DeleteAvailabilityBlock delete,
  })  : _create = create,
        _update = update,
        _delete = delete,
        super(const BlockEditorIdle()) {
    on<BlockEditorSubmitted>(_onSubmit);
    on<BlockEditorDeleteRequested>(_onDelete);
  }

  Future<void> _onSubmit(
    BlockEditorSubmitted event,
    Emitter<BlockEditorState> emit,
  ) async {
    emit(const BlockEditorSaving());

    if (event.existing == null) {
      final result = await _create(
        CreateAvailabilityBlockInput(
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          kind: event.kind,
          reason: event.reason,
          notes: event.notes,
          recurrenceRule: event.recurrenceRule,
        ),
      );
      result.fold(
        (failure) => emit(BlockEditorError(failure.message)),
        (block) => emit(BlockEditorSaved(block)),
      );
    } else {
      final result = await _update(
        event.existing!.id,
        UpdateAvailabilityBlockInput(
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          kind: event.kind,
          reason: event.reason,
          notes: event.notes,
          recurrenceRule: event.recurrenceRule,
          clearRecurrence: event.recurrenceRule == null,
        ),
      );
      result.fold(
        (failure) => emit(BlockEditorError(failure.message)),
        (block) => emit(BlockEditorSaved(block)),
      );
    }
  }

  Future<void> _onDelete(
    BlockEditorDeleteRequested event,
    Emitter<BlockEditorState> emit,
  ) async {
    emit(const BlockEditorSaving());
    final result = await _delete(event.blockId);
    result.fold(
      (failure) => emit(BlockEditorError(failure.message)),
      (_) => emit(const BlockEditorDeleted()),
    );
  }
}
