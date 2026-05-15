import 'package:get_it/get_it.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/data/datasources/auth_remote_datasource.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/get_current_user.dart';
import '../../features/auth/domain/usecases/sign_in.dart';
import '../../features/auth/domain/usecases/sign_out.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/messages/data/datasources/conversations_remote_datasource.dart';
import '../../features/messages/data/repositories/conversations_repository_impl.dart';
import '../../features/messages/domain/repositories/conversations_repository.dart';
import '../../features/messages/domain/usecases/get_conversations.dart';
import '../../features/messages/domain/usecases/watch_conversations.dart';
import '../../features/messages/presentation/bloc/conversations_bloc.dart';
// ── M5 imports ─────────────────────────────────────────────
import '../../features/appointments/data/datasources/appointment_remote_datasource.dart';
import '../../features/appointments/data/repositories/appointment_repository_impl.dart';
import '../../features/appointments/domain/repositories/appointment_repository.dart';
import '../../features/appointments/domain/usecases/get_my_appointments.dart';
import '../../features/appointments/domain/usecases/transition_appointment.dart';
import '../../features/appointments/domain/usecases/watch_my_appointments.dart';
import '../../features/appointments/presentation/bloc/appointments_bloc.dart';
import '../../features/availability/data/datasources/availability_remote_datasource.dart';
import '../../features/availability/data/repositories/availability_repository_impl.dart';
import '../../features/availability/domain/repositories/availability_repository.dart';
import '../../features/availability/domain/usecases/create_availability_block.dart';
import '../../features/availability/domain/usecases/delete_availability_block.dart';
import '../../features/availability/domain/usecases/get_my_availability_blocks.dart';
import '../../features/availability/domain/usecases/get_my_working_hours.dart';
import '../../features/availability/domain/usecases/update_availability_block.dart';
import '../../features/availability/domain/usecases/update_my_working_hours.dart';
import '../../features/availability/domain/usecases/watch_my_availability_blocks.dart';
import '../../features/availability/presentation/bloc/block_editor_bloc.dart';
import '../../features/availability/presentation/bloc/calendar_bloc.dart';
import '../../features/availability/presentation/bloc/working_hours_bloc.dart';
import '../../features/documents/data/datasources/document_remote_datasource.dart';
import '../../features/documents/data/repositories/document_repository_impl.dart';
import '../../features/documents/domain/repositories/document_repository.dart';
import '../../features/documents/domain/usecases/embed_signature_usecase.dart';
import '../../features/documents/domain/usecases/generate_pdf_document.dart';
import '../../features/documents/domain/usecases/get_prospect_documents.dart';
import '../../features/documents/presentation/bloc/signature_bloc.dart';
import '../../features/inspection/data/datasources/inspection_remote_datasource.dart';
import '../../features/inspection/data/repositories/inspection_repository_impl.dart';
import '../../features/inspection/domain/repositories/inspection_repository.dart';
import '../../features/inspection/domain/usecases/delete_inspection_photo.dart';
import '../../features/inspection/domain/usecases/get_or_create_inspection.dart';
import '../../features/inspection/domain/usecases/mark_inspection_complete.dart';
import '../../features/inspection/domain/usecases/save_inspection_report.dart';
import '../../features/inspection/domain/usecases/upload_inspection_photo.dart';
import '../../features/inspection/domain/usecases/watch_inspection_photos.dart';
import '../../features/inspection/presentation/bloc/inspection_bloc.dart';
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

  // ── Messages (SMS inbox) Feature ──────────────────────────

  // Datasources
  sl.registerLazySingleton<ConversationsRemoteDatasource>(
    () => ConversationsRemoteDatasourceImpl(sl()),
  );

  // Repositories
  sl.registerLazySingleton<ConversationsRepository>(
    () => ConversationsRepositoryImpl(sl()),
  );

  // Use cases
  sl.registerLazySingleton(() => GetConversations(sl()));
  sl.registerLazySingleton(() => WatchConversations(sl()));

  // BLoC
  sl.registerFactory(
    () => ConversationsBloc(
      getConversations: sl(),
      watchConversations: sl(),
    ),
  );

  // ── M5 Appointments Feature ───────────────────────────────
  sl.registerLazySingleton<AppointmentRemoteDatasource>(
    () => AppointmentRemoteDatasourceImpl(sl()),
  );
  sl.registerLazySingleton<AppointmentRepository>(
    () => AppointmentRepositoryImpl(sl()),
  );
  sl.registerLazySingleton(() => GetMyAppointments(sl()));
  sl.registerLazySingleton(() => WatchMyAppointments(sl()));
  sl.registerLazySingleton(() => TransitionAppointment(sl()));
  sl.registerFactory(
    () => AppointmentsBloc(
      get: sl(),
      watch: sl(),
      transition: sl(),
    ),
  );

  // ── M5 Availability Feature ───────────────────────────────
  sl.registerLazySingleton<AvailabilityRemoteDatasource>(
    () => AvailabilityRemoteDatasourceImpl(sl()),
  );
  sl.registerLazySingleton<AvailabilityRepository>(
    () => AvailabilityRepositoryImpl(sl()),
  );
  sl.registerLazySingleton(() => GetMyAvailabilityBlocks(sl()));
  sl.registerLazySingleton(() => WatchMyAvailabilityBlocks(sl()));
  sl.registerLazySingleton(() => CreateAvailabilityBlock(sl()));
  sl.registerLazySingleton(() => UpdateAvailabilityBlock(sl()));
  sl.registerLazySingleton(() => DeleteAvailabilityBlock(sl()));
  sl.registerLazySingleton(() => GetMyWorkingHours(sl()));
  sl.registerLazySingleton(() => UpdateMyWorkingHours(sl()));
  sl.registerFactory(
    () => CalendarBloc(
      getBlocks: sl(),
      watchBlocks: sl(),
      getWorkingHours: sl(),
    ),
  );
  sl.registerFactory(
    () => BlockEditorBloc(create: sl(), update: sl(), delete: sl()),
  );
  sl.registerFactory(
    () => WorkingHoursBloc(get: sl(), update: sl()),
  );

  // ── M5 Documents Feature ──────────────────────────────────
  sl.registerLazySingleton<DocumentRemoteDatasource>(
    () => DocumentRemoteDatasourceImpl(sl()),
  );
  sl.registerLazySingleton<DocumentRepository>(
    () => DocumentRepositoryImpl(sl()),
  );
  sl.registerLazySingleton(() => GetProspectDocuments(sl()));
  sl.registerLazySingleton(() => GeneratePdfDocument(sl()));
  sl.registerLazySingleton(() => EmbedSignature(sl()));
  sl.registerFactory(
    () => SignatureBloc(generate: sl(), embed: sl()),
  );

  // ── M5 Inspection Feature ─────────────────────────────────
  sl.registerLazySingleton<InspectionRemoteDatasource>(
    () => InspectionRemoteDatasourceImpl(sl()),
  );
  sl.registerLazySingleton<InspectionRepository>(
    () => InspectionRepositoryImpl(sl()),
  );
  sl.registerLazySingleton(() => GetOrCreateInspection(sl()));
  sl.registerLazySingleton(() => SaveInspectionReport(sl()));
  sl.registerLazySingleton(() => MarkInspectionComplete(sl()));
  sl.registerLazySingleton(() => UploadInspectionPhoto(sl()));
  sl.registerLazySingleton(() => DeleteInspectionPhoto(sl()));
  sl.registerLazySingleton(() => WatchInspectionPhotos(sl()));
  sl.registerFactory(
    () => InspectionBloc(
      getOrCreate: sl(),
      saveReport: sl(),
      uploadPhoto: sl(),
      deletePhoto: sl(),
      watchPhotos: sl(),
    ),
  );
}
