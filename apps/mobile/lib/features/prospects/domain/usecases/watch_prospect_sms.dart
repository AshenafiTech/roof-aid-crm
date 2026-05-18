import '../entities/sms_message_entity.dart';
import '../repositories/sms_repository.dart';

class WatchProspectSms {
  final SmsRepository repository;

  const WatchProspectSms(this.repository);

  Stream<List<SmsMessageEntity>> call(String prospectId) {
    return repository.watchMessages(prospectId);
  }
}
