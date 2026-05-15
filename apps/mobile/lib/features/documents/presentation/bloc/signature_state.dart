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
