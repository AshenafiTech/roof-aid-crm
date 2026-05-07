import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/sms_message_entity.dart';
import '../repositories/sms_repository.dart';

class SendProspectSms {
  final SmsRepository repository;

  const SendProspectSms(this.repository);

  Future<Either<Failure, SmsMessageEntity>> call({
    required String prospectId,
    required String body,
  }) {
    return repository.sendMessage(prospectId: prospectId, body: body);
  }
}
