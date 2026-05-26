import 'dart:async';

import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/prospect_entity.dart';
import '../../domain/repositories/prospect_repository.dart';
import '../datasources/prospect_local_datasource.dart';
import '../datasources/prospect_remote_datasource.dart';

/// Local-first read for the rufero's assigned prospects.
///
/// Mobile doesn't mutate prospects (no edits, no assignment changes —
/// those happen on the web), so there are no writes to queue. The
/// local datasource is purely a read-side cache populated by every
/// successful remote fetch / realtime tick.
class ProspectRepositoryImpl implements ProspectRepository {
  final ProspectRemoteDatasource remoteDatasource;
  final ProspectLocalDatasource local;

  const ProspectRepositoryImpl({
    required this.remoteDatasource,
    required this.local,
  });

  @override
  Future<Either<Failure, List<ProspectEntity>>> getAssignedProspects() async {
    try {
      final prospects = await remoteDatasource.fetchAssigned();
      await local.cacheList(prospects);
      return Right(prospects);
    } on NetworkException catch (_) {
      // Offline — surface what we have. Empty list is a valid answer
      // when the rufero has never loaded prospects on this device,
      // but normally they would have at least once.
      final cached = await local.getCached();
      return Right(cached);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Stream<List<ProspectEntity>> watchAssignedProspects() {
    // Remote realtime first, with an immediate cache emit so an
    // offline-boot rufero sees their list right away. Pulls from the
    // remote stream feed the cache on every change so a later offline
    // moment still has the latest snapshot.
    final controller = StreamController<List<ProspectEntity>>();

    Future<void> emitCached() async {
      if (controller.isClosed) return;
      controller.add(await local.getCached());
    }

    emitCached();
    final remoteSub = remoteDatasource.watchAssigned().listen(
      (list) async {
        await local.cacheList(list);
        if (controller.isClosed) return;
        controller.add(list);
      },
      onError: (Object _) => emitCached(),
    );

    controller.onCancel = () async {
      await remoteSub.cancel();
    };
    return controller.stream;
  }
}
