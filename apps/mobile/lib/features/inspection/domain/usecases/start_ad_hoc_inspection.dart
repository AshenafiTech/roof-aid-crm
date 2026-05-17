import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/inspection_repository.dart';

class StartAdHocInspection {
  final InspectionRepository repository;

  const StartAdHocInspection(this.repository);

  Future<Either<Failure, AdHocInspectionStart>> call({
    required String prospectId,
  }) {
    return repository.startAdHocInspection(prospectId: prospectId);
  }
}
