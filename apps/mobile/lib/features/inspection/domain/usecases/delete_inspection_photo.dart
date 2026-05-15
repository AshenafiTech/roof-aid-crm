import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/inspection_repository.dart';

class DeleteInspectionPhoto {
  final InspectionRepository repository;

  const DeleteInspectionPhoto(this.repository);

  Future<Either<Failure, Unit>> call(String photoId) {
    return repository.deletePhoto(photoId);
  }
}
