/// A single note attached to a prospect.
///
/// Mirrors the `notes` table in `supabase/migrations/002_core_tables.sql`.
/// `authorName` is a denormalized display value joined from `users` at
/// fetch time so the UI doesn't have to look it up per render.
class NoteEntity {
  final String id;
  final String tenantId;
  final String prospectId;
  final String authorId;
  final String? authorName;
  final String body;
  final DateTime createdAt;

  const NoteEntity({
    required this.id,
    required this.tenantId,
    required this.prospectId,
    required this.authorId,
    required this.body,
    required this.createdAt,
    this.authorName,
  });
}
