sealed class SignatureEvent {
  const SignatureEvent();
}

/// Mobile-only signing flow. The unsigned [documentId] is mandatory —
/// the office generates the PDF on the web, mobile only embeds the
/// signature into it.
class SignatureSubmitted extends SignatureEvent {
  final String prospectId;
  final String signerName;
  final String signaturePngBase64;
  final String documentId;

  const SignatureSubmitted({
    required this.prospectId,
    required this.signerName,
    required this.signaturePngBase64,
    required this.documentId,
  });
}
