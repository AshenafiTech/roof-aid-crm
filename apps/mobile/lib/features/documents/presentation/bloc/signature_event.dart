sealed class SignatureEvent {
  const SignatureEvent();
}

class SignatureSubmitted extends SignatureEvent {
  final String prospectId;
  final String signerName;
  final String signaturePngBase64;
  final String templateKind; // 'authorization' by default
  const SignatureSubmitted({
    required this.prospectId,
    required this.signerName,
    required this.signaturePngBase64,
    this.templateKind = 'authorization',
  });
}
