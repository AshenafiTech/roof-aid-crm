import 'package:get_it/get_it.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/data/datasources/auth_remote_datasource.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/get_current_user.dart';
import '../../features/auth/domain/usecases/sign_in.dart';
import '../../features/auth/domain/usecases/sign_out.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/prospects/data/datasources/prospect_remote_datasource.dart';
import '../../features/prospects/data/repositories/prospect_repository_impl.dart';
import '../../features/prospects/domain/repositories/prospect_repository.dart';
import '../../features/prospects/domain/usecases/get_assigned_prospects.dart';
import '../../features/prospects/domain/usecases/watch_assigned_prospects.dart';
import '../../features/prospects/presentation/bloc/prospects_bloc.dart';

final sl = GetIt.instance;

Future<void> initDependencies() async {
  // ── External ──────────────────────────────────────────────
  sl.registerLazySingleton<SupabaseClient>(
    () => Supabase.instance.client,
  );

  // ── Auth Feature ──────────────────────────────────────────

  // Datasources
  sl.registerLazySingleton<AuthRemoteDatasource>(
    () => AuthRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepositoryImpl(sl()),
  );

  // Use cases
  sl.registerLazySingleton(() => SignIn(sl()));
  sl.registerLazySingleton(() => SignOut(sl()));
  sl.registerLazySingleton(() => GetCurrentUser(sl()));

  // BLoC
  sl.registerFactory(
    () => AuthBloc(
      signIn: sl(),
      signOut: sl(),
      getCurrentUser: sl(),
    ),
  );

  // ── Prospects Feature ─────────────────────────────────────

  // Datasources
  sl.registerLazySingleton<ProspectRemoteDatasource>(
    () => ProspectRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<ProspectRepository>(
    () => ProspectRepositoryImpl(sl()),
  );

  // Use cases
  sl.registerLazySingleton(() => GetAssignedProspects(sl()));
  sl.registerLazySingleton(() => WatchAssignedProspects(sl()));

  // BLoC
  sl.registerFactory(
    () => ProspectsBloc(
      getAssigned: sl(),
      watchAssigned: sl(),
    ),
  );
}
