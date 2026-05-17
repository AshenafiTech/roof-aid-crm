sealed class SignatureEvent {
  const SignatureEvent();
}

class SignatureSubmitted extends SignatureEvent {
  final String prospectId;
  final String signerName;
  final String signaturePngBase64;
  final String templateKind; // 'authorization' by default
  /// If supplied, skip the generate-pdf step and go straight to
  /// embedding the signature on this existing unsigned document
  /// (set by [SignatureGenerateRequested] earlier in the flow, e.g.
  /// the document-preview screen).
  final String? documentId;

  const SignatureSubmitted({
    required this.prospectId,
    required this.signerName,
    required this.signaturePngBase64,
    this.templateKind = 'authorization',
    this.documentId,
  });
}

/// Used by the document-preview page to pre-generate the unsigned PDF
/// so the homeowner can review it before the signature pad opens. The
/// bloc emits [SignatureGenerated] with the new document id.
class SignatureGenerateRequested extends SignatureEvent {
  final String prospectId;
  final String templateKind;
  const SignatureGenerateRequested({
    required this.prospectId,
    this.templateKind = 'authorization',
  });
}
