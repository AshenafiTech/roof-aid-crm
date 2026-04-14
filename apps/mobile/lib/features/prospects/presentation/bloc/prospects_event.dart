import '../../domain/entities/prospect_entity.dart';

sealed class ProspectsEvent {
  const ProspectsEvent();
}

class ProspectsLoadRequested extends ProspectsEvent {
  const ProspectsLoadRequested();
}

class ProspectsRefreshRequested extends ProspectsEvent {
  const ProspectsRefreshRequested();
}

class ProspectsStreamUpdated extends ProspectsEvent {
  final List<ProspectEntity> prospects;

  const ProspectsStreamUpdated(this.prospects);
}

class ProspectsStreamFailed extends ProspectsEvent {
  final String message;

  const ProspectsStreamFailed(this.message);
}
