import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/sms_message_entity.dart';
import '../repositories/sms_repository.dart';

class GetProspectSms {
  final SmsRepository repository;

  const GetProspectSms(this.repository);

  Future<Either<Failure, List<SmsMessageEntity>>> call(String prospectId) {
    return repository.getMessages(prospectId);
  }
}
