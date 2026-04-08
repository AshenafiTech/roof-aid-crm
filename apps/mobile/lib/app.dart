import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class RoofAidApp extends StatelessWidget {
  const RoofAidApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Roof-Aid CRM',
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      routerConfig: GoRouter(
        initialLocation: '/login',
        routes: [
          GoRoute(
            path: '/login',
            builder: (context, state) => const Scaffold(
              body: Center(child: Text('Login')),
            ),
          ),
        ],
      ),
    );
  }
}
