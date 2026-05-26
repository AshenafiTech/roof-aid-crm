import 'dart:async';
import 'dart:developer' as developer;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/config/supabase_config.dart';
import 'core/di/injection_container.dart';
import 'core/network/network_error_detection.dart';
import 'core/offline/sync_worker.dart';
import 'app.dart';

Future<void> main() async {
  // Top-level guard for stray async errors that escape Future/Stream chains —
  // most importantly Supabase's background token-refresh, which surfaces a
  // SocketException via AuthRetryableFetchException whenever the device is
  // offline. We already render an `AuthOffline` UI for in-flight auth flows;
  // this just stops the runtime from showing a red error screen for the
  // *background* refresh attempts.
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    PlatformDispatcher.instance.onError = (error, stack) {
      if (isNetworkError(error)) {
        developer.log(
          'Suppressed background network error: $error',
          name: 'roof-aid',
        );
        return true; // mark handled — no red screen
      }
      return false; // anything else still crashes loudly in dev
    };

    FlutterError.onError = (details) {
      if (isNetworkError(details.exception)) {
        developer.log(
          'Suppressed network error in widget tree: ${details.exception}',
          name: 'roof-aid',
        );
        return;
      }
      FlutterError.presentError(details);
    };

    await dotenv.load(fileName: 'assets/.env');
    await Hive.initFlutter();
    await Supabase.initialize(
      url: SupabaseConfig.url,
      anonKey: SupabaseConfig.anonKey,
    );
    await initDependencies();
    // Boot the sync worker AFTER DI so feature repos have had a chance
    // to register their handlers. start() is idempotent so any
    // accidental second call is harmless.
    await sl<SyncWorker>().start();
    runApp(const RoofAidApp());
  }, (error, stack) {
    if (isNetworkError(error)) {
      developer.log(
        'Suppressed zone-level network error: $error',
        name: 'roof-aid',
      );
      return;
    }
    developer.log(
      'Uncaught zone error: $error',
      name: 'roof-aid',
      stackTrace: stack,
    );
  });
}

