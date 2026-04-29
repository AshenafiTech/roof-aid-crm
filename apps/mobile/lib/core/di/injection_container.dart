import 'package:get_it/get_it.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/data/datasources/auth_remote_datasource.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/get_current_user.dart';
import '../../features/auth/domain/usecases/sign_in.dart';
import '../../features/auth/domain/usecases/sign_out.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/prospects/data/datasources/note_remote_datasource.dart';
import '../../features/prospects/data/datasources/prospect_remote_datasource.dart';
import '../../features/prospects/data/datasources/sms_remote_datasource.dart';
import '../../features/prospects/data/repositories/note_repository_impl.dart';
import '../../features/prospects/data/repositories/prospect_repository_impl.dart';
import '../../features/prospects/data/repositories/sms_repository_impl.dart';
import '../../features/prospects/domain/repositories/note_repository.dart';
import '../../features/prospects/domain/repositories/prospect_repository.dart';
import '../../features/prospects/domain/repositories/sms_repository.dart';
import '../../features/prospects/domain/usecases/add_prospect_note.dart';
import '../../features/prospects/domain/usecases/check_can_message.dart';
import '../../features/prospects/domain/usecases/delete_prospect_note.dart';
import '../../features/prospects/domain/usecases/get_assigned_prospects.dart';
import '../../features/prospects/domain/usecases/get_prospect_notes.dart';
import '../../features/prospects/domain/usecases/get_prospect_sms.dart';
import '../../features/prospects/domain/usecases/mark_prospect_sms_read.dart';
import '../../features/prospects/domain/usecases/send_prospect_sms.dart';
import '../../features/prospects/domain/usecases/update_prospect_note.dart';
import '../../features/prospects/domain/usecases/watch_assigned_prospects.dart';
import '../../features/prospects/domain/usecases/watch_prospect_notes.dart';
import '../../features/prospects/domain/usecases/watch_prospect_sms.dart';
import '../../features/prospects/presentation/bloc/notes_bloc.dart';
import '../../features/prospects/presentation/bloc/prospects_bloc.dart';
import '../../features/prospects/presentation/bloc/sms_bloc.dart';

final sl = GetIt.instance;

Future<void> initDependencies() async {
  // ── External ──────────────────────────────────────────────
  sl.registerLazySingleton<SupabaseClient>(() => Supabase.instance.client);

  // ── Auth Feature ──────────────────────────────────────────

  // Datasources
  sl.registerLazySingleton<AuthRemoteDatasource>(
    () => AuthRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<AuthRepository>(() => AuthRepositoryImpl(sl()));

  // Use cases
  sl.registerLazySingleton(() => SignIn(sl()));
  sl.registerLazySingleton(() => SignOut(sl()));
  sl.registerLazySingleton(() => GetCurrentUser(sl()));

  // BLoC
  sl.registerFactory(
    () => AuthBloc(signIn: sl(), signOut: sl(), getCurrentUser: sl()),
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
    () => ProspectsBloc(getAssigned: sl(), watchAssigned: sl()),
  );

  // ── Notes Feature ─────────────────────────────────────────

  // Datasources
  sl.registerLazySingleton<NoteRemoteDatasource>(
    () => NoteRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<NoteRepository>(() => NoteRepositoryImpl(sl()));

  // Use cases
  sl.registerLazySingleton(() => GetProspectNotes(sl()));
  sl.registerLazySingleton(() => WatchProspectNotes(sl()));
  sl.registerLazySingleton(() => AddProspectNote(sl()));
  sl.registerLazySingleton(() => UpdateProspectNote(sl()));
  sl.registerLazySingleton(() => DeleteProspectNote(sl()));

  // BLoC
  sl.registerFactory(
    () => NotesBloc(
      getNotes: sl(),
      watchNotes: sl(),
      addNote: sl(),
      updateNote: sl(),
      deleteNote: sl(),
    ),
  );

  // ── SMS Feature ───────────────────────────────────────────

  // Datasources
  sl.registerLazySingleton<SmsRemoteDatasource>(
    () => SmsRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<SmsRepository>(() => SmsRepositoryImpl(sl()));

  // Use cases
  sl.registerLazySingleton(() => GetProspectSms(sl()));
  sl.registerLazySingleton(() => WatchProspectSms(sl()));
  sl.registerLazySingleton(() => SendProspectSms(sl()));
  sl.registerLazySingleton(() => CheckCanMessage(sl()));
  sl.registerLazySingleton(() => MarkProspectSmsRead(sl()));

  // BLoC
  sl.registerFactory(
    () => SmsBloc(
      getMessages: sl(),
      watchMessages: sl(),
      sendMessage: sl(),
      checkCanMessage: sl(),
      markRead: sl(),
    ),
  );
}
