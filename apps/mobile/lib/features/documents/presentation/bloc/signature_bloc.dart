import 'dart:io' show Platform;

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../domain/usecases/embed_signature_usecase.dart';
import 'signature_event.dart';
import 'signature_state.dart';

/// Mobile signing flow — embeds-only. The unsigned PDF is created by
/// the office on the web; mobile never calls `generate-pdf`. The
/// preview page upstream of the signature pad guarantees the
/// [SignatureSubmitted.documentId] is a real, unsigned document for
/// this prospect.
class SignatureBloc extends Bloc<SignatureEvent, SignatureState> {
  final EmbedSignature _embed;

  SignatureBloc({required EmbedSignature embed})
      : _embed = embed,
        super(const SignatureIdle()) {
    on<SignatureSubmitted>(_onSubmit);
  }

  Future<void> _onSubmit(
    SignatureSubmitted event,
    Emitter<SignatureState> emit,
  ) async {
    emit(const SignatureEmbedding());
    final result = await _embed(
      documentId: event.documentId,
      signaturePngBase64: event.signaturePngBase64,
      signerName: event.signerName,
      deviceType: _deviceType(),
    );

    result.fold(
      (failure) => emit(SignatureFailed(
        failure.message,
        isOffline: failure is NetworkFailure,
      )),
      (signed) => emit(SignatureDone(signed)),
    );
  }

  String _deviceType() {
    if (Platform.isIOS) return 'mobile_ios';
    if (Platform.isAndroid) return 'mobile_android';
    return 'mobile_other';
  }
}
