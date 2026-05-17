import '../../domain/entities/document_entity.dart';

sealed class SignatureState {
  const SignatureState();
}

class SignatureIdle extends SignatureState {
  const SignatureIdle();
}

class SignatureGenerating extends SignatureState {
  const SignatureGenerating();
}

/// Emitted by the preview page once the unsigned PDF has been built
/// so the UI can show a "ready to review" affordance + download link.
class SignatureGenerated extends SignatureState {
  final DocumentEntity unsignedDocument;
  const SignatureGenerated(this.unsignedDocument);
}

class SignatureEmbedding extends SignatureState {
  const SignatureEmbedding();
}

class SignatureDone extends SignatureState {
  final DocumentEntity signedDocument;
  const SignatureDone(this.signedDocument);
}

class SignatureFailed extends SignatureState {
  final String message;
  final bool isOffline;
  const SignatureFailed(this.message, {this.isOffline = false});
}
