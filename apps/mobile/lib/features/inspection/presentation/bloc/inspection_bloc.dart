import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../domain/entities/inspection_entity.dart';
import '../../domain/usecases/delete_inspection_photo.dart';
import '../../domain/usecases/get_or_create_inspection.dart';
import '../../domain/usecases/save_inspection_report.dart';
import '../../domain/usecases/update_photo_tags.dart';
import '../../domain/usecases/upload_inspection_photo.dart';
import '../../domain/usecases/watch_inspection_photos.dart';
import 'inspection_event.dart';
import 'inspection_state.dart';

class InspectionBloc extends Bloc<InspectionEvent, InspectionState> {
  final GetOrCreateInspection _getOrCreate;
  final SaveInspectionReport _saveReport;
  final UploadInspectionPhoto _uploadPhoto;
  final DeleteInspectionPhoto _deletePhoto;
  final UpdatePhotoTags _updateTags;
  final WatchInspectionPhotos _watchPhotos;
  StreamSubscription? _photosSub;

  // Debounce window for autosaving the damage form to the server.
  // Picked at 1.5 s — long enough that fast typing doesn't flood the
  // server, short enough that a rufero leaving the page doesn't lose
  // more than a sentence of changes.
  static const Duration _autoSaveDelay = Duration(milliseconds: 1500);
  Timer? _autoSaveTimer;

  InspectionBloc({
    required GetOrCreateInspection getOrCreate,
    required SaveInspectionReport saveReport,
    required UploadInspectionPhoto uploadPhoto,
    required DeleteInspectionPhoto deletePhoto,
    required UpdatePhotoTags updateTags,
    required WatchInspectionPhotos watchPhotos,
  })  : _getOrCreate = getOrCreate,
        _saveReport = saveReport,
        _uploadPhoto = uploadPhoto,
        _deletePhoto = deletePhoto,
        _updateTags = updateTags,
        _watchPhotos = watchPhotos,
        super(const InspectionInitial()) {
    on<InspectionLoadRequested>(_onLoad);
    on<InspectionFormChanged>(_onFormChanged);
    on<InspectionPhotoAddRequested>(_onPhotoAdd);
    on<InspectionPhotoTagsChanged>(_onPhotoTagsChanged);
    on<InspectionPhotoDeleted>(_onPhotoDelete);
    on<InspectionPhotosStreamUpdated>(_onPhotosStreamUpdated);
    on<InspectionSaveRequested>(_onSave);
    on<InspectionAutoSaveRequested>(_onAutoSave);
  }

  Future<void> _onLoad(
    InspectionLoadRequested event,
    Emitter<InspectionState> emit,
  ) async {
    emit(const InspectionLoading());
    final result = await _getOrCreate(
      appointmentId: event.appointmentId,
      prospectId: event.prospectId,
    );
    result.fold(
      (failure) => emit(InspectionError(
        failure.message,
        isOffline: failure is NetworkFailure,
      )),
      (inspection) {
        emit(InspectionReady(
          draft: inspection,
          form: DamageFormData.fromInspection(inspection),
          photos: const [],
        ));
        _subscribePhotos(inspection.id);
      },
    );
  }

  void _onFormChanged(
    InspectionFormChanged event,
    Emitter<InspectionState> emit,
  ) {
    final current = state;
    if (current is InspectionReady) {
      emit(current.copyWith(form: event.form));
      // Debounce: every keystroke restarts the timer; once the user
      // pauses for [_autoSaveDelay], we push the latest form to the
      // server. The user doesn't see anything change — it's invisible
      // persistence so the draft survives navigating away.
      _autoSaveTimer?.cancel();
      _autoSaveTimer = Timer(_autoSaveDelay, () {
        if (!isClosed) add(const InspectionAutoSaveRequested());
      });
    }
  }

  Future<void> _onAutoSave(
    InspectionAutoSaveRequested event,
    Emitter<InspectionState> emit,
  ) async {
    final current = state;
    if (current is! InspectionReady) return;
    // No isSaving flag — autosave is silent. Errors stay quiet too;
    // the user will see them on the explicit "Save & Continue" path.
    final result = await _saveReport(
      inspectionId: current.draft.id,
      form: current.form,
    );
    result.fold(
      (failure) {
        // Surface for debugging but don't disrupt the form state.
        // ignore: avoid_print
        print('[InspectionBloc] autosave failed: ${failure.message}');
      },
      (inspection) {
        final latest = state;
        if (latest is InspectionReady) {
          emit(latest.copyWith(draft: inspection));
        }
      },
    );
  }

  Future<void> _onPhotoAdd(
    InspectionPhotoAddRequested event,
    Emitter<InspectionState> emit,
  ) async {
    final current = state;
    if (current is! InspectionReady) return;
    final result = await _uploadPhoto(
      inspectionId: current.draft.id,
      prospectId: current.draft.prospectId,
      bytes: event.bytes,
      tags: event.tags,
      widthPx: event.widthPx,
      heightPx: event.heightPx,
      gpsLat: event.gpsLat,
      gpsLng: event.gpsLng,
    );
    result.fold(
      (failure) =>
          emit(current.copyWith(lastError: () => failure.message)),
      (photo) {
        // Optimistic: push the new photo into state immediately so the
        // grid shows it without waiting for the realtime round-trip.
        // The realtime stream will reconcile shortly; we de-dupe by id
        // so it can't double-up.
        final latest = state;
        if (latest is InspectionReady) {
          final exists = latest.photos.any((p) => p.id == photo.id);
          if (!exists) {
            emit(latest.copyWith(
              photos: [...latest.photos, photo],
              lastError: () => null,
            ));
          }
        }
      },
    );
  }

  Future<void> _onPhotoTagsChanged(
    InspectionPhotoTagsChanged event,
    Emitter<InspectionState> emit,
  ) async {
    final current = state;
    if (current is! InspectionReady) return;

    // Optimistic: swap tags on the in-memory photo immediately so the
    // tag chip in the grid updates without waiting for the realtime
    // round-trip.
    final optimisticPhotos = current.photos
        .map((p) => p.id == event.photoId ? p.copyWith(tags: event.tags) : p)
        .toList(growable: false);
    emit(current.copyWith(photos: optimisticPhotos, lastError: () => null));

    final result = await _updateTags(
      photoId: event.photoId,
      tags: event.tags,
    );
    result.fold(
      (failure) {
        // Roll back to the pre-change photo list.
        final latest = state;
        if (latest is InspectionReady) {
          emit(latest.copyWith(
            photos: current.photos,
            lastError: () => failure.message,
          ));
        }
      },
      (_) {
        // Server confirmed; realtime will reconcile if it disagrees.
      },
    );
  }

  Future<void> _onPhotoDelete(
    InspectionPhotoDeleted event,
    Emitter<InspectionState> emit,
  ) async {
    final current = state;
    if (current is! InspectionReady) return;
    final result = await _deletePhoto(event.photoId);
    result.fold(
      (failure) =>
          emit(current.copyWith(lastError: () => failure.message)),
      (_) {},
    );
  }

  void _onPhotosStreamUpdated(
    InspectionPhotosStreamUpdated event,
    Emitter<InspectionState> emit,
  ) {
    final current = state;
    if (current is InspectionReady) {
      emit(current.copyWith(photos: event.photos));
    }
  }

  Future<void> _onSave(
    InspectionSaveRequested event,
    Emitter<InspectionState> emit,
  ) async {
    final current = state;
    if (current is! InspectionReady) return;
    if (!current.canSave) {
      emit(current.copyWith(
        lastError: () => 'Form is incomplete — add the required photos + fields.',
      ));
      return;
    }

    emit(current.copyWith(isSaving: true, lastError: () => null));
    final result = await _saveReport(
      inspectionId: current.draft.id,
      form: current.form,
    );
    result.fold(
      (failure) => emit(current.copyWith(
        isSaving: false,
        lastError: () => failure.message,
      )),
      (inspection) {
        // Stay on Ready (rufero can still tweak), but bubble the saved snapshot.
        emit(InspectionReady(
          draft: inspection,
          form: DamageFormData.fromInspection(inspection),
          photos: current.photos,
        ));
      },
    );
  }

  void _subscribePhotos(String inspectionId) {
    _photosSub?.cancel();
    _photosSub = _watchPhotos(inspectionId).listen(
      (photos) => add(InspectionPhotosStreamUpdated(photos)),
    );
  }

  @override
  Future<void> close() async {
    _photosSub?.cancel();
    // Flush a pending autosave before tearing down the bloc, so a
    // quick page-pop doesn't drop the last edit. We do this directly
    // against the use case — the event pump has already been stopped
    // by Bloc.close, so `add(...)` would be a no-op here.
    if (_autoSaveTimer?.isActive ?? false) {
      _autoSaveTimer?.cancel();
      final current = state;
      if (current is InspectionReady) {
        await _saveReport(
          inspectionId: current.draft.id,
          form: current.form,
        );
      }
    }
    return super.close();
  }
}
