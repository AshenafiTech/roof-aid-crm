import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/prospects_bloc.dart';
import '../bloc/prospects_event.dart';
import '../bloc/prospects_state.dart';
import '../widgets/prospect_list_tile.dart';

/// The body content of the prospects tab — used inside [MainShell].
/// Does NOT include Scaffold or AppBar (the shell provides those).
class ProspectsBody extends StatelessWidget {
  const ProspectsBody({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ProspectsBloc, ProspectsState>(
      builder: (context, state) {
        return switch (state) {
          ProspectsInitial() ||
          ProspectsLoading() =>
            const Center(child: CircularProgressIndicator()),
          ProspectsError(:final message) => _ErrorView(message: message),
          ProspectsLoaded(:final prospects) => prospects.isEmpty
              ? const _EmptyView()
              : _ProspectsList(prospects: prospects),
        };
      },
    );
  }
}

class _ProspectsList extends StatelessWidget {
  final List prospects;

  const _ProspectsList({required this.prospects});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        final bloc = context.read<ProspectsBloc>();
        bloc.add(const ProspectsRefreshRequested());
        await bloc.stream.firstWhere(
          (s) => s is ProspectsLoaded || s is ProspectsError,
        );
      },
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: prospects.length,
        itemBuilder: (_, i) => ProspectListTile(prospect: prospects[i]),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 96),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.08),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.people_outline,
            size: 48,
            color: theme.colorScheme.primary.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'No prospects assigned',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          "When a Telefonista assigns you a prospect, it'll show up here.\nPull down to refresh.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;

  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.error.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.error_outline,
                size: 40,
                color: theme.colorScheme.error,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Something went wrong',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => context
                  .read<ProspectsBloc>()
                  .add(const ProspectsLoadRequested()),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
