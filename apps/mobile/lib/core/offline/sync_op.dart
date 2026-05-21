import 'dart:convert';

/// Stable string tags for each kind of queued mutation. Stored on disk
/// so changes here are breaking — add new kinds, never rename.
class SyncOpKind {
  SyncOpKind._();

  static const String inspectionFormPatch = 'inspection_form_patch';
  static const String photoUpload = 'photo_upload';
  static const String photoTagUpdate = 'photo_tag_update';
  static const String photoDelete = 'photo_delete';
  static const String embedSignature = 'embed_signature';
  static const String appointmentTransition = 'appointment_transition';
}

/// A single queued mutation. Stored as JSON in Hive so the schema can
/// evolve without code-gen ceremony. `payload` shape depends on `kind`
/// — each handler in the worker knows what to expect.
///
/// Retries: `attempts` is incremented on every failure; the worker
/// applies exponential backoff (1s → 30s cap) before retrying.
class SyncOp {
  /// Local UUID, kept stable across retries. Useful when the same op
  /// might be enqueued twice (e.g. tag change → tag change again) so
  /// the UI can show one row + show progress.
  final String id;
  final String kind;
  final Map<String, dynamic> payload;

  /// Wall-clock when first enqueued — used for UI ("queued 2m ago").
  final DateTime createdAt;
  final int attempts;

  /// Last error message, if any. Stays around even after a successful
  /// retry so we can log "succeeded after N attempts".
  final String? lastError;

  /// Optional coalescing key. When set, enqueueing a new op with the
  /// same (kind, dedupKey) replaces the existing one — useful for
  /// "sync inspection X" style ops where only the latest state matters.
  final String? dedupKey;

  const SyncOp({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.attempts = 0,
    this.lastError,
    this.dedupKey,
  });

  SyncOp copyWith({
    int? attempts,
    String? Function()? lastError,
  }) {
    return SyncOp(
      id: id,
      kind: kind,
      payload: payload,
      createdAt: createdAt,
      attempts: attempts ?? this.attempts,
      lastError: lastError != null ? lastError() : this.lastError,
      dedupKey: dedupKey,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
        'attempts': attempts,
        'lastError': lastError,
        'dedupKey': dedupKey,
      };

  factory SyncOp.fromJson(Map<String, dynamic> json) => SyncOp(
        id: json['id'] as String,
        kind: json['kind'] as String,
        payload: (json['payload'] as Map).cast<String, dynamic>(),
        createdAt: DateTime.parse(json['createdAt'] as String),
        attempts: (json['attempts'] as num?)?.toInt() ?? 0,
        lastError: json['lastError'] as String?,
        dedupKey: json['dedupKey'] as String?,
      );

  String encode() => jsonEncode(toJson());
  factory SyncOp.decode(String raw) =>
      SyncOp.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}
