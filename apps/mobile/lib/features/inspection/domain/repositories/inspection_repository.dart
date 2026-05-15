import 'dart:typed_data';

import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/inspection_entity.dart';
import '../entities/photo_entity.dart';

abstract class InspectionRepository {
  /// Returns an existing draft for this appointment or creates a new one.
  /// Idempotent: safe to call on every screen open.
  Future<Either<Failure, InspectionEntity>> getOrCreateForAppointment({
    required String appointmentId,
    required String prospectId,
  });

  /// Saves the damage form data to an existing inspection.
  Future<Either<Failure, InspectionEntity>> saveDamageForm({
    required String inspectionId,
    required DamageFormData form,
  });

  /// Marks the inspection complete (rufero finishes the on-site workflow).
  Future<Either<Failure, InspectionEntity>> markComplete(String inspectionId);

  /// Photos under an inspection.
  Future<Either<Failure, List<PhotoEntity>>> getPhotos(String inspectionId);
  Stream<List<PhotoEntity>> watchPhotos(String inspectionId);

  /// Uploads a JPEG to Storage + inserts a `photos` row. The bytes have
  /// already been compressed by [PhotoProcessor] before this call.
  Future<Either<Failure, PhotoEntity>> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  });

  Future<Either<Failure, Unit>> deletePhoto(String photoId);

  Future<Either<Failure, PhotoEntity>> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  });
}
