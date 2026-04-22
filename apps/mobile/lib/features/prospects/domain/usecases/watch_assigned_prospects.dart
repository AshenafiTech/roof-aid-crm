import '../entities/prospect_entity.dart';
import '../repositories/prospect_repository.dart';

class WatchAssignedProspects {
  final ProspectRepository repository;

  const WatchAssignedProspects(this.repository);

  Stream<List<ProspectEntity>> call() {
    return repository.watchAssignedProspects();
  }
}
