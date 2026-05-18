import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/can_message_verdict.dart';
import '../repositories/sms_repository.dart';

class CheckCanMessage {
  final SmsRepository repository;

  const CheckCanMessage(this.repository);

  Future<Either<Failure, CanMessageVerdict>> call(String prospectId) {
    return repository.checkCanMessage(prospectId);
  }
}
