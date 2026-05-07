import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../repositories/sms_repository.dart';

class MarkProspectSmsRead {
  final SmsRepository repository;

  const MarkProspectSmsRead(this.repository);

  Future<Either<Failure, Unit>> call(String prospectId) {
    return repository.markAsRead(prospectId);
  }
}
