import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../auth/presentation/bloc/auth_event.dart';
import '../bloc/prospects_bloc.dart';
import '../bloc/prospects_event.dart';
import '../bloc/prospects_state.dart';
import '../widgets/prospect_list_tile.dart';

class ProspectsPage extends StatelessWidget {
  const ProspectsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider<ProspectsBloc>(
      create: (_) =>
          sl<ProspectsBloc>()..add(const ProspectsLoadRequested()),
      child: const _ProspectsView(),
    );
  }
}

class _ProspectsView extends StatelessWidget {
  const _ProspectsView();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Prospects'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => context
                .read<AuthBloc>()
                .add(const AuthSignOutRequested()),
          ),
        ],
      ),
      body: BlocBuilder<ProspectsBloc, ProspectsState>(
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
      ),
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
        // Wait for the next terminal state so the spinner stays until the
        // refresh completes.
        await bloc.stream.firstWhere(
          (s) => s is ProspectsLoaded || s is ProspectsError,
        );
      },
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: prospects.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
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
      // ListView so pull-to-refresh still works on an empty page.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 96),
      children: [
        Icon(
          Icons.inbox_outlined,
          size: 64,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: 16),
        Text(
          'No prospects assigned yet',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          "When a Telefonista assigns you a prospect, it'll show up here.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
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
            Icon(
              Icons.error_outline,
              size: 48,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: theme.textTheme.titleMedium,
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
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
