import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../domain/entities/prospect_entity.dart';
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
          ProspectsInitial() || ProspectsLoading() => const Center(
            child: CircularProgressIndicator(),
          ),
          ProspectsError(:final message, :final isOffline) => _ErrorView(
            message: message,
            isOffline: isOffline,
          ),
          ProspectsLoaded(:final prospects) =>
            prospects.isEmpty
                ? const _EmptyView()
                : _ProspectsList(prospects: prospects),
        };
      },
    );
  }
}

class _ProspectsList extends StatefulWidget {
  final List<ProspectEntity> prospects;

  const _ProspectsList({required this.prospects});

  @override
  State<_ProspectsList> createState() => _ProspectsListState();
}

class _ProspectsListState extends State<_ProspectsList> {
  final Map<String, GlobalKey> _tileKeys = {};
  String? _recentlyViewedId;
  Timer? _highlightClearTimer;

  @override
  void dispose() {
    _highlightClearTimer?.cancel();
    super.dispose();
  }

  GlobalKey _keyFor(String id) =>
      _tileKeys.putIfAbsent(id, () => GlobalKey());

  Future<void> _openDetail(ProspectEntity p) async {
    await context.push('/prospects/${p.id}', extra: p);
    if (!mounted) return;

    _highlightClearTimer?.cancel();
    setState(() => _recentlyViewedId = p.id);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _tileKeys[p.id]?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeOutCubic,
          alignment: 0.3,
        );
      }
    });

    _highlightClearTimer = Timer(const Duration(milliseconds: 500), () {
      if (!mounted) return;
      setState(() => _recentlyViewedId = null);
    });
  }

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
        itemCount: widget.prospects.length,
        itemBuilder: (_, i) {
          final p = widget.prospects[i];
          return ProspectListTile(
            key: _keyFor(p.id),
            prospect: p,
            highlight: _recentlyViewedId == p.id,
            onTap: () => _openDetail(p),
          );
        },
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
  final bool isOffline;

  const _ErrorView({required this.message, this.isOffline = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final iconColor = isOffline
        ? theme.colorScheme.onSurfaceVariant
        : theme.colorScheme.error;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isOffline ? Icons.wifi_off_rounded : Icons.error_outline,
                size: 40,
                color: iconColor,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              isOffline ? "You're offline" : 'Something went wrong',
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
              onPressed: () => context.read<ProspectsBloc>().add(
                const ProspectsLoadRequested(),
              ),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
