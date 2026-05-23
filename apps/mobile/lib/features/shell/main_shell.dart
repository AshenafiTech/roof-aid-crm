import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/di/injection_container.dart';
import '../../core/offline/sync_status_banner.dart';
import '../../core/theme/theme_controller.dart';
import '../auth/presentation/bloc/auth_bloc.dart';
import '../auth/presentation/bloc/auth_event.dart';
import '../auth/presentation/bloc/auth_state.dart';
import '../availability/presentation/pages/calendar_page.dart';
import '../documents/presentation/pages/documents_page.dart';
import '../messages/presentation/bloc/conversations_bloc.dart';
import '../messages/presentation/bloc/conversations_event.dart';
import '../messages/presentation/pages/messages_page.dart';
import '../prospects/presentation/bloc/prospects_bloc.dart';
import '../prospects/presentation/bloc/prospects_event.dart';
import '../prospects/presentation/pages/prospects_map_view.dart';
import '../prospects/presentation/pages/prospects_page.dart';
import 'placeholder_page.dart';

enum _ProspectsViewMode { list, map }

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 1; // Start on Prospects tab

  // The Documents tab lives inside an IndexedStack and stays mounted
  // across tab switches, so its FutureBuilder won't auto-refresh when
  // a sign happens via a different navigation path (e.g. prospect
  // detail → docs tab → sign). Re-pull when the tab is re-activated.
  final GlobalKey<DocumentsPageState> _documentsKey =
      GlobalKey<DocumentsPageState>();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = context.watch<AuthBloc>().state;
    final userName = authState is AuthAuthenticated
        ? authState.user.displayName
        : 'User';
    final userRole = authState is AuthAuthenticated ? authState.user.role : '';

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_currentIndex]),
        actions: [
          // Temporary light/dark toggle — will be removed once the
          // Settings screen exposes a proper Light/Dark/System control.
          ValueListenableBuilder<ThemeMode>(
            valueListenable: ThemeController.mode,
            builder: (context, _, _) {
              final isDark =
                  ThemeController.resolvedBrightness(context) ==
                  Brightness.dark;
              return IconButton(
                tooltip: isDark
                    ? 'Switch to light mode'
                    : 'Switch to dark mode',
                icon: Icon(
                  isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                  color: isDark ? Colors.amber : theme.colorScheme.primary,
                ),
                onPressed: ThemeController.toggle,
              );
            },
          ),
          // User avatar + menu
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: theme.colorScheme.primary,
                    child: Text(
                      _initials(userName),
                      style: TextStyle(
                        color: theme.colorScheme.onPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: theme.colorScheme.onSurfaceVariant,
                    size: 20,
                  ),
                ],
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      userName,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _roleLabel(userRole),
                      style: TextStyle(
                        fontSize: 12,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'signout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 18),
                    SizedBox(width: 8),
                    Text('Sign out'),
                  ],
                ),
              ),
            ],
            onSelected: (value) {
              if (value == 'signout') {
                context.read<AuthBloc>().add(const AuthSignOutRequested());
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Surfaces offline / queued-sync state above whatever tab is
          // active. Renders nothing when online with an empty queue.
          const SyncStatusBanner(),
          Expanded(
            child: IndexedStack(
        index: _currentIndex,
        children: [
          const CalendarPage(),
          BlocProvider<ProspectsBloc>(
            create: (_) =>
                sl<ProspectsBloc>()..add(const ProspectsLoadRequested()),
            child: const _ProspectsTab(),
          ),
          DocumentsPage(key: _documentsKey),
          BlocProvider<ConversationsBloc>(
            create: (_) => sl<ConversationsBloc>()
              ..add(const ConversationsLoadRequested()),
            child: const MessagesPage(),
          ),
          const PlaceholderPage(
            icon: Icons.settings_outlined,
            title: 'Settings',
            subtitle: 'Profile and app preferences',
          ),
        ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: MediaQuery(
        // The rest of the app is clamped to 1.3× in app.dart for accessibility.
        // The nav bar lives in fixed-height chrome (72 dp), so 1.3× still
        // pushes the labels too big in easy mode — re-clamp to 1.2× here so
        // the bar stays calm without affecting any other screen.
        data: MediaQuery.of(context).copyWith(
          textScaler: MediaQuery.of(context).textScaler.clamp(
            minScaleFactor: 1.0,
            maxScaleFactor: 1.2,
          ),
        ),
        child: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) {
          // Re-fetch the documents list when the user re-opens the
          // tab — covers the case where a sign happened on another
          // surface and the IndexedStack-cached page is stale.
          if (i == 2 && _currentIndex != 2) {
            _documentsKey.currentState?.refresh();
          }
          setState(() => _currentIndex = i);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Schedule',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Prospects',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            selectedIcon: Icon(Icons.description),
            label: 'Documents',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
        ),
      ),
    );
  }

  static const _titles = [
    'Schedule',
    'Prospects',
    'Documents',
    'Messages',
    'Settings',
  ];

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'rufero':
        return 'Field Inspector';
      case 'telefonista':
        return 'Telefonista';
      case 'admin':
        return 'Administrator';
      case 'owner':
        return 'Owner';
      case 'super_admin':
        return 'Super Admin';
      default:
        return role;
    }
  }
}

/// Prospects tab body with a list/map toggle. The surrounding BlocProvider
/// (in [MainShell]) owns the ProspectsBloc, so both views share one fetch
/// and one realtime subscription.
class _ProspectsTab extends StatefulWidget {
  const _ProspectsTab();

  @override
  State<_ProspectsTab> createState() => _ProspectsTabState();
}

class _ProspectsTabState extends State<_ProspectsTab> {
  _ProspectsViewMode _mode = _ProspectsViewMode.list;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: SegmentedButton<_ProspectsViewMode>(
            segments: const [
              ButtonSegment(
                value: _ProspectsViewMode.list,
                label: Text('List'),
                icon: Icon(Icons.view_list_outlined, size: 18),
              ),
              ButtonSegment(
                value: _ProspectsViewMode.map,
                label: Text('Map'),
                icon: Icon(Icons.map_outlined, size: 18),
              ),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
        ),
        Expanded(
          child: IndexedStack(
            index: _mode == _ProspectsViewMode.list ? 0 : 1,
            children: const [ProspectsBody(), ProspectsMapView()],
          ),
        ),
      ],
    );
  }
}
