import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../core/theme/app_theme.dart';
import '../../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../../auth/presentation/bloc/auth_state.dart';
import '../../../domain/entities/note_entity.dart';
import '../../bloc/notes_bloc.dart';
import '../../bloc/notes_event.dart';
import '../../bloc/notes_state.dart';
import '../empty_state.dart';

/// How long after creation the author can still edit or delete their own
/// note. Must stay in sync with the `notes_update` / `notes_delete` RLS
/// policies in `009_notes_edit_delete_rls.sql`.
const _editDeleteWindow = Duration(minutes: 15);

/// Notes feed + composer for a prospect. The list shows newest notes at the
/// top; submitting pushes the new row onto the feed via the realtime stream.
class NotesTab extends StatelessWidget {
  const NotesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final currentUserId = switch (context.watch<AuthBloc>().state) {
      AuthAuthenticated(user: final u) => u.id,
      _ => null,
    };

    return BlocListener<NotesBloc, NotesState>(
      listenWhen: (prev, curr) {
        if (curr is! NotesLoaded) return false;
        if (prev is! NotesLoaded) return curr.actionError != null;
        return curr.actionError != null &&
            (curr.actionError != prev.actionError ||
                curr.actionErrorTick != prev.actionErrorTick);
      },
      listener: (context, state) {
        if (state is! NotesLoaded || state.actionError == null) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: Text(state.actionError!),
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 3),
            ),
          );
      },
      child: BlocBuilder<NotesBloc, NotesState>(
        builder: (context, state) {
          return Column(
            children: [
              Expanded(child: _buildFeed(context, state, currentUserId)),
              _NoteComposer(
                isSubmitting: state is NotesLoaded && state.isSubmitting,
                submitError: state is NotesLoaded ? state.submitError : null,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildFeed(
    BuildContext context,
    NotesState state,
    String? currentUserId,
  ) {
    if (state is NotesInitial || state is NotesLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is NotesError) {
      return _ErrorView(message: state.message, isOffline: state.isOffline);
    }
    if (state is NotesLoaded) {
      if (state.notes.isEmpty) {
        return const EmptyState(
          icon: Icons.sticky_note_2_outlined,
          title: 'No notes yet',
          description:
              'Add the first note about this prospect — visits, observations, '
              'anything the next Rufero should see.',
        );
      }
      return ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        itemCount: state.notes.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _NoteCard(
          note: state.notes[i],
          currentUserId: currentUserId,
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

class _NoteCard extends StatelessWidget {
  final NoteEntity note;
  final String? currentUserId;

  const _NoteCard({required this.note, required this.currentUserId});

  bool get _canMutate {
    if (currentUserId == null || note.authorId != currentUserId) return false;
    return DateTime.now().difference(note.createdAt) <= _editDeleteWindow;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final author = note.authorName?.trim().isNotEmpty == true
        ? note.authorName!
        : 'Unknown';

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: AppTheme.iconPerson.withValues(alpha: 0.15),
                child: Text(
                  _initials(author),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppTheme.iconPerson,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  author,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _relativeTime(note.createdAt),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              _canMutate
                  ? _NoteMenu(note: note)
                  : const SizedBox(width: 8),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              note.body,
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first)
        .toUpperCase();
  }

  String _relativeTime(DateTime createdAt) {
    final diff = DateTime.now().difference(createdAt);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    final d = createdAt.toLocal();
    return '${d.month}/${d.day}/${d.year % 100}';
  }
}

class _NoteMenu extends StatelessWidget {
  final NoteEntity note;

  const _NoteMenu({required this.note});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopupMenuButton<_NoteMenuAction>(
      tooltip: 'More',
      padding: EdgeInsets.zero,
      icon: Icon(
        Icons.more_horiz,
        size: 20,
        color: theme.colorScheme.onSurfaceVariant,
      ),
      onSelected: (action) async {
        switch (action) {
          case _NoteMenuAction.edit:
            await _openEditDialog(context);
          case _NoteMenuAction.delete:
            await _confirmDelete(context);
        }
      },
      itemBuilder: (_) => const [
        PopupMenuItem(
          value: _NoteMenuAction.edit,
          child: ListTile(
            leading: Icon(Icons.edit_outlined, size: 20),
            title: Text('Edit'),
            dense: true,
            contentPadding: EdgeInsets.zero,
          ),
        ),
        PopupMenuItem(
          value: _NoteMenuAction.delete,
          child: ListTile(
            leading: Icon(Icons.delete_outline, size: 20, color: Colors.red),
            title: Text('Delete', style: TextStyle(color: Colors.red)),
            dense: true,
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ],
    );
  }

  Future<void> _openEditDialog(BuildContext context) async {
    final bloc = context.read<NotesBloc>();
    final result = await showDialog<String>(
      context: context,
      builder: (_) => _EditNoteDialog(initial: note.body),
    );
    if (result == null) return;
    final trimmed = result.trim();
    if (trimmed.isEmpty || trimmed == note.body) return;
    bloc.add(NoteEditRequested(noteId: note.id, body: trimmed));
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final bloc = context.read<NotesBloc>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Delete note?'),
          content: const Text(
            'This note will be permanently removed. This cannot be undone.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(ctx).colorScheme.error,
              ),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    bloc.add(NoteDeleteRequested(note.id));
  }
}

enum _NoteMenuAction { edit, delete }

class _EditNoteDialog extends StatefulWidget {
  final String initial;

  const _EditNoteDialog({required this.initial});

  @override
  State<_EditNoteDialog> createState() => _EditNoteDialogState();
}

class _EditNoteDialogState extends State<_EditNoteDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit note'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        minLines: 3,
        maxLines: 8,
        decoration: const InputDecoration(
          border: OutlineInputBorder(),
          hintText: 'Update the note…',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_controller.text),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final bool isOffline;

  const _ErrorView({required this.message, this.isOffline = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOffline ? Icons.wifi_off_rounded : Icons.error_outline,
              color: isOffline
                  ? theme.colorScheme.onSurfaceVariant
                  : theme.colorScheme.error,
              size: 32,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _NoteComposer extends StatefulWidget {
  final bool isSubmitting;
  final String? submitError;

  const _NoteComposer({required this.isSubmitting, this.submitError});

  @override
  State<_NoteComposer> createState() => _NoteComposerState();
}

class _NoteComposerState extends State<_NoteComposer> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final hasText = _controller.text.trim().isNotEmpty;
      if (hasText != _hasText) setState(() => _hasText = hasText);
    });
  }

  @override
  void didUpdateWidget(covariant _NoteComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Clear the field once a submit has succeeded (isSubmitting went true →
    // false without a new submitError).
    if (oldWidget.isSubmitting &&
        !widget.isSubmitting &&
        widget.submitError == null &&
        _controller.text.isNotEmpty) {
      _controller.clear();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty || widget.isSubmitting) return;
    context.read<NotesBloc>().add(NoteSubmitRequested(text));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.submitError != null) ...[
                _ComposerError(message: widget.submitError!),
                const SizedBox(height: 8),
              ],
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focusNode,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.newline,
                      enabled: !widget.isSubmitting,
                      decoration: InputDecoration(
                        hintText: 'Add a note…',
                        isDense: true,
                        filled: true,
                        fillColor: theme.colorScheme.surfaceContainerHigh,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _SendButton(
                    enabled: _hasText && !widget.isSubmitting,
                    isSubmitting: widget.isSubmitting,
                    onPressed: _submit,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  final bool enabled;
  final bool isSubmitting;
  final VoidCallback onPressed;

  const _SendButton({
    required this.enabled,
    required this.isSubmitting,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = enabled
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurface.withValues(alpha: 0.12);
    final fg = enabled
        ? theme.colorScheme.onPrimary
        : theme.colorScheme.onSurface.withValues(alpha: 0.38);

    return SizedBox(
      width: 44,
      height: 44,
      child: Material(
        color: bg,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onPressed : null,
          child: Center(
            child: isSubmitting
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(fg),
                    ),
                  )
                : Icon(Icons.arrow_upward_rounded, color: fg, size: 20),
          ),
        ),
      ),
    );
  }
}

class _ComposerError extends StatelessWidget {
  final String message;

  const _ComposerError({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline,
            size: 16,
            color: theme.colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
