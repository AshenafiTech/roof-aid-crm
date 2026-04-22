import '../../domain/entities/note_entity.dart';

class NoteModel extends NoteEntity {
  const NoteModel({
    required super.id,
    required super.tenantId,
    required super.prospectId,
    required super.authorId,
    required super.body,
    required super.createdAt,
    super.authorName,
  });

  /// Deserializes a note row. The query should select:
  ///   `*, author:users!author_id(first_name, last_name)`
  /// so the author display name is available without a second round-trip.
  factory NoteModel.fromMap(Map<String, dynamic> map) {
    return NoteModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      prospectId: map['prospect_id'] as String,
      authorId: map['author_id'] as String,
      body: map['body'] as String,
      createdAt: _parseDate(map['created_at']) ?? DateTime.now(),
      authorName: _parseAuthorName(map['author']),
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static String? _parseAuthorName(dynamic author) {
    if (author is! Map) return null;
    final first = (author['first_name'] as String?)?.trim();
    final last = (author['last_name'] as String?)?.trim();
    final combined = [
      first,
      last,
    ].where((s) => s != null && s.isNotEmpty).join(' ');
    return combined.isEmpty ? null : combined;
  }
}
