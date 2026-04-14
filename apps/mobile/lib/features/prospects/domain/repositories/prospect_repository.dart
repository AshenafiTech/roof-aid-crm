import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/prospect_entity.dart';

abstract class ProspectRepository {
  /// One-shot fetch of the current user's assigned prospects.
  /// Used for pull-to-refresh and the initial load fallback.
  Future<Either<Failure, List<ProspectEntity>>> getAssignedProspects();

  /// Live stream of the current user's assigned prospects.
  /// Emits the initial snapshot and every subsequent change (realtime).
  ///
  /// Note: we return a raw stream (no `Either`) because wrapping every
  /// realtime event in an Either adds friction for no real upside —
  /// errors surface via `Stream.onError` at the consumer.
  Stream<List<ProspectEntity>> watchAssignedProspects();
}
