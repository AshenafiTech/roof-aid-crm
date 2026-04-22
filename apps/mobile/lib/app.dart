import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import 'core/di/injection_container.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';
import 'features/auth/presentation/bloc/auth_event.dart';
import 'features/auth/presentation/bloc/auth_state.dart';
import 'features/auth/presentation/pages/login_page.dart';
import 'features/prospects/domain/entities/prospect_entity.dart';
import 'features/prospects/presentation/pages/prospect_detail_page.dart';
import 'features/shell/main_shell.dart';

class RoofAidApp extends StatelessWidget {
  const RoofAidApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<AuthBloc>()..add(const AuthCheckRequested()),
      child: const _AppView(),
    );
  }
}

class _AppView extends StatefulWidget {
  const _AppView();

  @override
  State<_AppView> createState() => _AppViewState();
}

class _AppViewState extends State<_AppView> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = _buildRouter();
  }

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  GoRouter _buildRouter() {
    return GoRouter(
      initialLocation: '/login',
      refreshListenable: GoRouterRefreshStream(context.read<AuthBloc>().stream),
      redirect: (context, state) {
        final authState = context.read<AuthBloc>().state;
        final isOnLogin = state.matchedLocation == '/login';

        if (authState is AuthInitial || authState is AuthLoading) {
          return null;
        }

        final isAuthenticated = authState is AuthAuthenticated;

        if (!isAuthenticated && !isOnLogin) return '/login';
        if (isAuthenticated && isOnLogin) return '/dashboard';

        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
        GoRoute(
          path: '/dashboard',
          builder: (context, state) => const MainShell(),
        ),
        GoRoute(
          path: '/prospects/:id',
          builder: (context, state) {
            final prospect = state.extra as ProspectEntity?;
            if (prospect == null) {
              // Direct URL navigation (deep link / refresh) isn't supported
              // in M3 — every entry comes from the list or map with extra
              // set. Fetch-by-id lands when deep links + push notifications
              // do.
              return Scaffold(
                appBar: AppBar(),
                body: const Center(
                  child: Text('Open this prospect from the list or map.'),
                ),
              );
            }
            return ProspectDetailPage(prospect: prospect);
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.mode,
      builder: (context, mode, _) {
        return MaterialApp.router(
          title: 'Roof-Aid CRM',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: mode,
          routerConfig: _router,
        );
      },
    );
  }
}

/// Converts a Stream into a Listenable for GoRouter's refreshListenable.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.asBroadcastStream().listen((_) => notifyListeners());
  }

  late final dynamic _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
