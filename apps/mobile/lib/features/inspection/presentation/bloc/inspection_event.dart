import 'dart:typed_data';

import '../../domain/entities/inspection_entity.dart';
import '../../domain/entities/photo_entity.dart';

sealed class InspectionEvent {
  const InspectionEvent();
}

class InspectionLoadRequested extends InspectionEvent {
  final String appointmentId;
  final String prospectId;
  const InspectionLoadRequested({
    required this.appointmentId,
    required this.prospectId,
  });
}

class InspectionFormChanged extends InspectionEvent {
  final DamageFormData form;
  const InspectionFormChanged(this.form);
}

class InspectionPhotoAddRequested extends InspectionEvent {
  final Uint8List bytes;
  final List<String> tags;
  final int widthPx;
  final int heightPx;
  final double? gpsLat;
  final double? gpsLng;

  const InspectionPhotoAddRequested({
    required this.bytes,
    required this.tags,
    required this.widthPx,
    required this.heightPx,
    this.gpsLat,
    this.gpsLng,
  });
}

class InspectionPhotoTagsChanged extends InspectionEvent {
  final String photoId;
  final List<String> tags;
  const InspectionPhotoTagsChanged(this.photoId, this.tags);
}

class InspectionPhotoDeleted extends InspectionEvent {
  final String photoId;
  const InspectionPhotoDeleted(this.photoId);
}

class InspectionPhotosStreamUpdated extends InspectionEvent {
  final List<PhotoEntity> photos;
  const InspectionPhotosStreamUpdated(this.photos);
}

class InspectionSaveRequested extends InspectionEvent {
  const InspectionSaveRequested();
}
