import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../prospects/domain/entities/prospect_entity.dart';
import '../../../prospects/presentation/pages/prospect_detail_page.dart';
import '../../../prospects/presentation/widgets/empty_state.dart';
import '../bloc/conversations_bloc.dart';
import '../bloc/conversations_event.dart';
import '../bloc/conversations_state.dart';
import '../widgets/conversation_tile.dart';

/// Inbox view of SMS threads. One row per prospect with at least one SMS in
/// `sms_logs`, ordered by most-recent activity. Tap → opens the prospect's
/// detail page on the SMS tab.
///
/// Today this aggregates client-side from `sms_logs` (cap 500 rows). The
/// repository contract stays the same when the backend exposes a
/// `get_sms_conversations()` RPC — only the datasource swaps.
class MessagesPage extends StatelessWidget {
  const MessagesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ConversationsBloc, ConversationsState>(
      builder: (context, state) {
        if (state is ConversationsInitial || state is ConversationsLoading) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is ConversationsError) {
          return _ErrorView(
            message: state.message,
            isOffline: state.isOffline,
            onRetry: () => context
                .read<ConversationsBloc>()
                .add(const ConversationsLoadRequested()),
          );
        }
        if (state is ConversationsLoaded) {
          if (state.conversations.isEmpty) {
            return const EmptyState(
              icon: Icons.chat_bubble_outline,
              title: 'No conversations yet',
              description:
                  'Send the first SMS from a prospect\'s detail page to start a conversation.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              context
                  .read<ConversationsBloc>()
                  .add(const ConversationsLoadRequested());
            },
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: state.conversations.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final conversation = state.conversations[i];
                return ConversationTile(
                  conversation: conversation,
                  onTap: () => _openThread(context, conversation.prospect),
                );
              },
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  void _openThread(BuildContext context, ProspectEntity prospect) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProspectDetailPage(
          prospect: prospect,
          initialTabIndex: 3, // SMS tab
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final bool isOffline;
  final VoidCallback onRetry;

  const _ErrorView({
    required this.message,
    required this.onRetry,
    this.isOffline = false,
  });

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
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
