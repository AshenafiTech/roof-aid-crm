import '../entities/photo_entity.dart';
import '../repositories/inspection_repository.dart';

class WatchInspectionPhotos {
  final InspectionRepository repository;

  const WatchInspectionPhotos(this.repository);

  Stream<List<PhotoEntity>> call(String inspectionId) {
    return repository.watchPhotos(inspectionId);
  }
}
