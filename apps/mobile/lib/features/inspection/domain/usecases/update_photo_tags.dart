import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/photo_entity.dart';
import '../repositories/inspection_repository.dart';

class UpdatePhotoTags {
  final InspectionRepository repository;

  const UpdatePhotoTags(this.repository);

  Future<Either<Failure, PhotoEntity>> call({
    required String photoId,
    required List<String> tags,
  }) {
    return repository.updatePhotoTags(photoId: photoId, tags: tags);
  }
}
