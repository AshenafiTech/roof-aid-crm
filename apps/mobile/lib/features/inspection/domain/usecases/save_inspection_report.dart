import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/inspection_entity.dart';
import '../repositories/inspection_repository.dart';

class SaveInspectionReport {
  final InspectionRepository repository;

  const SaveInspectionReport(this.repository);

  Future<Either<Failure, InspectionEntity>> call({
    required String inspectionId,
    required DamageFormData form,
  }) {
    return repository.saveDamageForm(inspectionId: inspectionId, form: form);
  }
}
