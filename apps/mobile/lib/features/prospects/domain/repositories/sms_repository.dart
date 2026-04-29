import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/can_message_verdict.dart';
import '../entities/sms_message_entity.dart';

abstract class SmsRepository {
  /// One-shot fetch of the SMS conversation for a prospect, oldest first
  /// (so the UI can render bottom-aligned chat-style without re-sorting).
  Future<Either<Failure, List<SmsMessageEntity>>> getMessages(String prospectId);

  /// Live stream of the SMS conversation for a prospect. Emits the initial
  /// snapshot and every subsequent webhook-driven update.
  Stream<List<SmsMessageEntity>> watchMessages(String prospectId);

  /// Send an outbound SMS via the `send_sms` RPC. The RPC enforces DNC,
  /// inserts the row, and enqueues the Telnyx call — so a successful return
  /// means the message is *queued*, not yet delivered.
  Future<Either<Failure, SmsMessageEntity>> sendMessage({
    required String prospectId,
    required String body,
  });

  /// Verdict from the `can_message` RPC. Used by the UI to decide whether
  /// to enable the composer and what notice to show when disabled.
  Future<Either<Failure, CanMessageVerdict>> checkCanMessage(String prospectId);

  /// Mark all inbound messages for this prospect as read by the current user.
  /// Idempotent — a no-op if there's nothing unread.
  Future<Either<Failure, Unit>> markAsRead(String prospectId);
}
