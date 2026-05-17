import 'dart:io' show Platform;

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../domain/usecases/embed_signature_usecase.dart';
import '../../domain/usecases/generate_pdf_document.dart';
import 'signature_event.dart';
import 'signature_state.dart';

class SignatureBloc extends Bloc<SignatureEvent, SignatureState> {
  final GeneratePdfDocument _generate;
  final EmbedSignature _embed;

  SignatureBloc({
    required GeneratePdfDocument generate,
    required EmbedSignature embed,
  })  : _generate = generate,
        _embed = embed,
        super(const SignatureIdle()) {
    on<SignatureGenerateRequested>(_onGenerate);
    on<SignatureSubmitted>(_onSubmit);
  }

  Future<void> _onGenerate(
    SignatureGenerateRequested event,
    Emitter<SignatureState> emit,
  ) async {
    emit(const SignatureGenerating());
    final result = await _generate(
      prospectId: event.prospectId,
      templateKind: event.templateKind,
    );
    result.fold(
      (failure) => emit(SignatureFailed(
        failure.message,
        isOffline: failure is NetworkFailure,
      )),
      (doc) => emit(SignatureGenerated(doc)),
    );
  }

  Future<void> _onSubmit(
    SignatureSubmitted event,
    Emitter<SignatureState> emit,
  ) async {
    String? documentId = event.documentId;

    // Generate-on-the-fly path (no preview step) — kept for backwards
    // compat with surfaces that haven't been moved behind the preview.
    if (documentId == null) {
      emit(const SignatureGenerating());
      final genResult = await _generate(
        prospectId: event.prospectId,
        templateKind: event.templateKind,
      );
      final unsigned = genResult.fold((_) => null, (d) => d);
      if (unsigned == null) {
        final f = genResult.fold((f) => f, (_) => null);
        emit(SignatureFailed(
          f?.message ?? 'Failed to generate document',
          isOffline: f is NetworkFailure,
        ));
        return;
      }
      documentId = unsigned.id;
    }

    emit(const SignatureEmbedding());
    final embedResult = await _embed(
      documentId: documentId,
      signaturePngBase64: event.signaturePngBase64,
      signerName: event.signerName,
      deviceType: _deviceType(),
    );

    embedResult.fold(
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
