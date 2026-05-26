import '../../domain/entities/availability_block_entity.dart';

sealed class BlockEditorState {
  const BlockEditorState();
}

class BlockEditorIdle extends BlockEditorState {
  const BlockEditorIdle();
}

class BlockEditorSaving extends BlockEditorState {
  const BlockEditorSaving();
}

class BlockEditorSaved extends BlockEditorState {
  final AvailabilityBlockEntity block;
  const BlockEditorSaved(this.block);
}

class BlockEditorDeleted extends BlockEditorState {
  const BlockEditorDeleted();
}

class BlockEditorError extends BlockEditorState {
  final String message;
  const BlockEditorError(this.message);
}
