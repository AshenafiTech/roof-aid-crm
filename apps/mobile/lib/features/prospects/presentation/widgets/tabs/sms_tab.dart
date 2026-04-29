import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../core/theme/app_theme.dart';
import '../../../domain/entities/sms_message_entity.dart';
import '../../bloc/sms_bloc.dart';
import '../../bloc/sms_event.dart';
import '../../bloc/sms_state.dart';
import '../empty_state.dart';

class SmsTab extends StatelessWidget {
  const SmsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocListener<SmsBloc, SmsState>(
      listenWhen: (prev, curr) {
        if (curr is! SmsLoaded) return false;
        if (prev is! SmsLoaded) return curr.submitError != null;
        return curr.submitError != null &&
            (curr.submitError != prev.submitError ||
                curr.submitErrorTick != prev.submitErrorTick);
      },
      listener: (context, state) {
        if (state is! SmsLoaded || state.submitError == null) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: Text(state.submitError!),
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 3),
            ),
          );
      },
      child: BlocBuilder<SmsBloc, SmsState>(
        builder: (context, state) {
          if (state is SmsInitial || state is SmsLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is SmsError) {
            return _ErrorView(message: state.message, isOffline: state.isOffline);
          }
          if (state is SmsLoaded) {
            return Column(
              children: [
                Expanded(
                  child: state.messages.isEmpty
                      ? const EmptyState(
                          icon: Icons.chat_bubble_outline,
                          title: 'No conversation yet',
                          description:
                              'Send the first message to start a thread with this prospect.',
                        )
                      : _ThreadList(messages: state.messages),
                ),
                _Composer(
                  // DNC stays open — only `blocksUi` reasons (no_phone,
                  // cross_tenant, not_found) replace the composer with a
                  // notice. The page-level DncBanner already warns the agent.
                  enabled: !state.verdict.blocksUi && !state.isSubmitting,
                  isSubmitting: state.isSubmitting,
                  blockedReason:
                      state.verdict.blocksUi ? state.verdict.displayMessage : null,
                ),
              ],
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }
}

// ─── Thread ──────────────────────────────────────────────────

class _ThreadList extends StatefulWidget {
  final List<SmsMessageEntity> messages;

  const _ThreadList({required this.messages});

  @override
  State<_ThreadList> createState() => _ThreadListState();
}

class _ThreadListState extends State<_ThreadList> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());
  }

  @override
  void didUpdateWidget(covariant _ThreadList oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Auto-scroll to latest when a message is added (length grew or last id
    // changed). Don't scroll on every update or we'll yank the user away
    // when they're reading older messages.
    final grew = widget.messages.length > oldWidget.messages.length;
    final lastChanged = widget.messages.isNotEmpty &&
        oldWidget.messages.isNotEmpty &&
        widget.messages.last.id != oldWidget.messages.last.id;
    if (grew || lastChanged) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());
    }
  }

  void _scrollToEnd() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
      itemCount: widget.messages.length,
      separatorBuilder: (_, _) => const SizedBox(height: 6),
      itemBuilder: (_, i) => _Bubble(message: widget.messages[i]),
    );
  }
}

class _Bubble extends StatelessWidget {
  final SmsMessageEntity message;

  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isOut = message.isOutbound;

    final bgColor = isOut
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHigh;
    final fgColor = isOut
        ? theme.colorScheme.onPrimary
        : theme.colorScheme.onSurface;

    final radius = BorderRadius.only(
      topLeft: const Radius.circular(16),
      topRight: const Radius.circular(16),
      bottomLeft: Radius.circular(isOut ? 16 : 4),
      bottomRight: Radius.circular(isOut ? 4 : 16),
    );

    final bubble = Opacity(
      opacity: message.isPending ? 0.7 : 1.0,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: radius,
          border: message.isFailed
              ? Border.all(color: theme.colorScheme.error, width: 1.5)
              : null,
        ),
        child: Text(
          message.body,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: fgColor,
            height: 1.35,
          ),
        ),
      ),
    );

    return Column(
      crossAxisAlignment:
          isOut ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment:
              isOut ? MainAxisAlignment.end : MainAxisAlignment.start,
          children: [bubble],
        ),
        const SizedBox(height: 3),
        _BubbleMeta(message: message),
      ],
    );
  }
}

class _BubbleMeta extends StatelessWidget {
  final SmsMessageEntity message;

  const _BubbleMeta({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isOut = message.isOutbound;

    final iconWidget = isOut ? _statusIcon(theme) : null;
    final timeText = _formatTime(message.sentAt);

    return Padding(
      padding: EdgeInsets.only(
        left: isOut ? 0 : 6,
        right: isOut ? 6 : 0,
      ),
      child: Row(
        mainAxisAlignment:
            isOut ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Text(
            timeText,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (iconWidget != null) ...[
            const SizedBox(width: 4),
            iconWidget,
          ],
        ],
      ),
    );
  }

  Widget _statusIcon(ThemeData theme) {
    if (message.isFailed) {
      return Icon(Icons.error_outline,
          size: 12, color: theme.colorScheme.error);
    }
    if (message.isPending) {
      return Icon(Icons.schedule,
          size: 12, color: theme.colorScheme.onSurfaceVariant);
    }
    if (message.isDelivered) {
      return Icon(Icons.done_all,
          size: 12, color: theme.colorScheme.primary);
    }
    return Icon(Icons.done,
        size: 12, color: theme.colorScheme.onSurfaceVariant);
  }

  String _formatTime(DateTime dt) {
    final local = dt.toLocal();
    final now = DateTime.now();
    final sameDay = now.year == local.year &&
        now.month == local.month &&
        now.day == local.day;
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    if (sameDay) return '$hh:$mm';
    return '${local.month}/${local.day} $hh:$mm';
  }
}

// ─── Composer ────────────────────────────────────────────────

class _Composer extends StatefulWidget {
  final bool enabled;
  final bool isSubmitting;
  final String? blockedReason;

  const _Composer({
    required this.enabled,
    required this.isSubmitting,
    this.blockedReason,
  });

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
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
  void didUpdateWidget(covariant _Composer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Clear the field once a submit succeeds (isSubmitting flips true → false
    // and there's no surfaced submit error in the BlocListener path).
    if (oldWidget.isSubmitting &&
        !widget.isSubmitting &&
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
    if (text.isEmpty || !widget.enabled) return;
    context.read<SmsBloc>().add(SmsSendRequested(text));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (widget.blockedReason != null) {
      return Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainer,
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Icon(
                  Icons.info_outline,
                  size: 16,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.blockedReason!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

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
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.newline,
                  enabled: widget.enabled,
                  decoration: InputDecoration(
                    hintText: 'Type a message…',
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
                enabled: _hasText && widget.enabled,
                isSubmitting: widget.isSubmitting,
                onPressed: _submit,
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
        ? AppTheme.iconSms
        : theme.colorScheme.onSurface.withValues(alpha: 0.12);
    final fg = enabled
        ? Colors.white
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

// ─── Error view ──────────────────────────────────────────────

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
