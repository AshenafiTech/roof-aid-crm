import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get_it/get_it.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../offline/sync_worker.dart';

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
import '../../features/appointments/data/datasources/appointment_local_datasource.dart';
import '../../features/appointments/data/datasources/appointment_remote_datasource.dart';
import '../../features/appointments/data/repositories/appointment_repository_impl.dart';
import '../../features/appointments/domain/repositories/appointment_repository.dart';
import '../../features/appointments/domain/usecases/get_my_appointments.dart';
import '../../features/appointments/domain/usecases/get_prospect_appointments.dart';
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
import '../../features/documents/data/datasources/document_local_datasource.dart';
import '../../features/documents/data/datasources/document_remote_datasource.dart';
import '../../features/documents/data/repositories/document_repository_impl.dart';
import '../../features/documents/domain/repositories/document_repository.dart';
import '../../features/documents/domain/usecases/embed_signature_usecase.dart';
import '../../features/documents/domain/usecases/generate_pdf_document.dart';
import '../../features/documents/domain/usecases/get_my_documents.dart';
import '../../features/documents/domain/usecases/get_prospect_documents.dart';
import '../../features/documents/presentation/bloc/signature_bloc.dart';
import '../../features/inspection/data/datasources/inspection_local_datasource.dart';
import '../../features/inspection/data/datasources/inspection_remote_datasource.dart';
import '../../features/inspection/data/datasources/photo_local_datasource.dart';
import '../../features/inspection/data/repositories/inspection_repository_impl.dart';
import '../../features/inspection/domain/repositories/inspection_repository.dart';
import '../../features/inspection/domain/usecases/delete_inspection_photo.dart';
import '../../features/inspection/domain/usecases/get_or_create_inspection.dart';
import '../../features/inspection/domain/usecases/get_prospect_inspections.dart';
import '../../features/inspection/domain/usecases/mark_inspection_complete.dart';
import '../../features/inspection/domain/usecases/save_inspection_report.dart';
import '../../features/inspection/domain/usecases/start_ad_hoc_inspection.dart';
import '../../features/inspection/domain/usecases/update_photo_tags.dart';
import '../../features/inspection/domain/usecases/upload_inspection_photo.dart';
import '../../features/inspection/domain/usecases/watch_inspection_photos.dart';
import '../../features/inspection/presentation/bloc/inspection_bloc.dart';
import '../../features/prospects/data/datasources/note_local_datasource.dart';
import '../../features/prospects/data/datasources/note_remote_datasource.dart';
import '../../features/prospects/data/datasources/prospect_local_datasource.dart';
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
  sl.registerLazySingleton<Connectivity>(() => Connectivity());

  // ── Offline / Sync ────────────────────────────────────────
  // Eager singleton — main.dart calls start() after DI is built.
  // Feature repos may push handlers into it via registerHandler.
  sl.registerLazySingleton<SyncWorker>(() => SyncWorker(sl()));

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
  sl.registerLazySingleton<ProspectLocalDatasource>(
    () => ProspectLocalDatasourceImpl(),
  );

  // Repositories
  sl.registerLazySingleton<ProspectRepository>(
    () => ProspectRepositoryImpl(
      remoteDatasource: sl(),
      local: sl(),
    ),
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
  sl.registerLazySingleton<NoteLocalDatasource>(
    () => NoteLocalDatasourceImpl(),
  );

  // Repositories — eager singleton so the note_add / note_update /
  // note_delete sync handlers register at app boot (otherwise queued
  // notes from a prior session wouldn't drain).
  sl.registerSingleton<NoteRepository>(
    NoteRepositoryImpl(
      remoteDatasource: sl(),
      local: sl(),
      syncWorker: sl(),
      supabase: sl(),
    ),
  );

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
  sl.registerLazySingleton<AppointmentLocalDatasource>(
    () => AppointmentLocalDatasourceImpl(),
  );
  // Eager singleton — the constructor registers the
  // appointment_transition sync handler. Lazy registration would
  // leave queued transitions un-drainable on app start.
  // documentsForPreCache lets schedule fetches warm the PDF cache
  // for every prospect on today's list — the rufero arrives at
  // each visit with the docs already on disk for offline viewing.
  sl.registerSingleton<AppointmentRepository>(
    AppointmentRepositoryImpl(
      remote: sl(),
      local: sl(),
      syncWorker: sl(),
      // Lazy resolver — DocumentRepository is registered later in
      // this file. Resolving at call time avoids any registration-
      // order coupling between the two repos.
      documentsForPreCache: () => sl<DocumentRepository>(),
    ),
  );
  sl.registerLazySingleton(() => GetMyAppointments(sl()));
  sl.registerLazySingleton(() => WatchMyAppointments(sl()));
  sl.registerLazySingleton(() => GetProspectAppointments(sl()));
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
  sl.registerLazySingleton<DocumentLocalDatasource>(
    () => DocumentLocalDatasourceImpl(),
  );
  // Eager singleton — the constructor registers the embed_signature
  // sync handler. Lazy registration would leave queued signatures
  // un-drainable on app start until something pulled the repo.
  sl.registerSingleton<DocumentRepository>(
    DocumentRepositoryImpl(
      remote: sl(),
      local: sl(),
      syncWorker: sl(),
    ),
  );
  sl.registerLazySingleton(() => GetProspectDocuments(sl()));
  sl.registerLazySingleton(() => GetMyDocuments(sl()));
  // GeneratePdfDocument intentionally left registered (kept for any
  // future mobile-side regen scenario), but no mobile surface calls
  // it — documents are produced by the web app.
  sl.registerLazySingleton(() => GeneratePdfDocument(sl()));
  sl.registerLazySingleton(() => EmbedSignature(sl()));
  sl.registerFactory(() => SignatureBloc(embed: sl()));

  // ── M5 Inspection Feature ─────────────────────────────────
  sl.registerLazySingleton<InspectionRemoteDatasource>(
    () => InspectionRemoteDatasourceImpl(sl()),
  );
  sl.registerLazySingleton<InspectionLocalDatasource>(
    () => InspectionLocalDatasourceImpl(),
  );
  sl.registerLazySingleton<PhotoLocalDatasource>(
    () => PhotoLocalDatasourceImpl(),
  );
  // Repository is eager-registered (not lazy) because its constructor
  // wires handlers into the SyncWorker (form patch, photo upload, tag
  // update, photo delete). If it stays lazy, those handlers never
  // register until something pulls the repo, and pending ops from the
  // previous session don't drain on app launch.
  sl.registerSingleton<InspectionRepository>(
    InspectionRepositoryImpl(
      remote: sl(),
      local: sl(),
      photos: sl(),
      syncWorker: sl(),
    ),
  );
  sl.registerLazySingleton(() => GetOrCreateInspection(sl()));
  sl.registerLazySingleton(() => GetProspectInspections(sl()));
  sl.registerLazySingleton(() => StartAdHocInspection(sl()));
  sl.registerLazySingleton(() => SaveInspectionReport(sl()));
  sl.registerLazySingleton(() => MarkInspectionComplete(sl()));
  sl.registerLazySingleton(() => UploadInspectionPhoto(sl()));
  sl.registerLazySingleton(() => DeleteInspectionPhoto(sl()));
  sl.registerLazySingleton(() => UpdatePhotoTags(sl()));
  sl.registerLazySingleton(() => WatchInspectionPhotos(sl()));
  sl.registerFactory(
    () => InspectionBloc(
      getOrCreate: sl(),
      saveReport: sl(),
      uploadPhoto: sl(),
      deletePhoto: sl(),
      updateTags: sl(),
      watchPhotos: sl(),
    ),
  );
}
