import 'dart:typed_data';

import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/photo_entity.dart';
import '../repositories/inspection_repository.dart';

class UploadInspectionPhoto {
  final InspectionRepository repository;

  const UploadInspectionPhoto(this.repository);

  Future<Either<Failure, PhotoEntity>> call({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  }) {
    return repository.uploadPhoto(
      inspectionId: inspectionId,
      prospectId: prospectId,
      bytes: bytes,
      tags: tags,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      widthPx: widthPx,
      heightPx: heightPx,
    );
  }
}
