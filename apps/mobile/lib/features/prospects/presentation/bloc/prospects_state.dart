import '../../domain/entities/prospect_entity.dart';

sealed class ProspectsState {
  const ProspectsState();
}

class ProspectsInitial extends ProspectsState {
  const ProspectsInitial();
}

class ProspectsLoading extends ProspectsState {
  const ProspectsLoading();
}

class ProspectsLoaded extends ProspectsState {
  final List<ProspectEntity> prospects;

  const ProspectsLoaded(this.prospects);
}

class ProspectsError extends ProspectsState {
  final String message;
  final bool isOffline;

  const ProspectsError(this.message, {this.isOffline = false});
}
