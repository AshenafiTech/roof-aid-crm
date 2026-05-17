import 'dart:typed_data';

import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/inspection_entity.dart';
import '../../domain/entities/photo_entity.dart';
import '../../domain/repositories/inspection_repository.dart';
import '../datasources/inspection_remote_datasource.dart';

class InspectionRepositoryImpl implements InspectionRepository {
  final InspectionRemoteDatasource remote;

  const InspectionRepositoryImpl(this.remote);

  @override
  Future<Either<Failure, InspectionEntity>> getOrCreateForAppointment({
    required String appointmentId,
    required String prospectId,
  }) async {
    try {
      final i = await remote.getOrCreateForAppointment(
        appointmentId: appointmentId,
        prospectId: prospectId,
      );
      return Right(i);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, AdHocInspectionStart>> startAdHocInspection({
    required String prospectId,
  }) async {
    try {
      final r = await remote.startAdHocInspection(prospectId: prospectId);
      return Right(
        AdHocInspectionStart(
          appointmentId: r.appointmentId,
          inspectionId: r.inspectionId,
        ),
      );
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, InspectionEntity>> saveDamageForm({
    required String inspectionId,
    required DamageFormData form,
  }) async {
    try {
      final i =
          await remote.saveDamageForm(inspectionId: inspectionId, form: form);
      return Right(i);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, InspectionEntity>> markComplete(String inspectionId) async {
    try {
      final i = await remote.markComplete(inspectionId);
      return Right(i);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<PhotoEntity>>> getPhotos(String inspectionId) async {
    try {
      final list = await remote.fetchPhotos(inspectionId);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<PhotoEntity>> watchPhotos(String inspectionId) =>
      remote.watchPhotos(inspectionId);

  @override
  Future<Either<Failure, PhotoEntity>> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  }) async {
    try {
      final p = await remote.uploadPhoto(
        inspectionId: inspectionId,
        prospectId: prospectId,
        bytes: bytes,
        tags: tags,
        gpsLat: gpsLat,
        gpsLng: gpsLng,
        widthPx: widthPx,
        heightPx: heightPx,
      );
      return Right(p);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, Unit>> deletePhoto(String photoId) async {
    try {
      await remote.deletePhoto(photoId);
      return const Right(unit);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, PhotoEntity>> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  }) async {
    try {
      final p = await remote.updatePhotoTags(photoId: photoId, tags: tags);
      return Right(p);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, String>> getPhotoSignedUrl(String storagePath) async {
    try {
      final url = await remote.getPhotoSignedUrl(storagePath);
      return Right(url);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<InspectionEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      return Right(list);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }
}
