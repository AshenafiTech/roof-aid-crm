import '../entities/availability_block_entity.dart';
import '../repositories/availability_repository.dart';

class WatchMyAvailabilityBlocks {
  final AvailabilityRepository repository;

  const WatchMyAvailabilityBlocks(this.repository);

  Stream<List<AvailabilityBlockEntity>> call() {
    return repository.watchMyBlocks();
  }
}
