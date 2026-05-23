/// Centralized Hive box names. Anything that opens a box should pull
/// the name from here so a typo can't silently spawn a parallel store.
class HiveBoxes {
  HiveBoxes._();

  /// Per-appointment inspection draft (form + photo metadata, not blobs).
  /// Keyed by `appointment_id`. Holds the source-of-truth while offline;
  /// reconciled against the server on drain.
  static const String inspectionDrafts = 'inspection_drafts';

  /// Photo metadata + local file path. Keyed by `photo_id` (uuid v4 we
  /// generate locally before upload). `uploaded: false` rows are picked
  /// up by [photoUpload] sync ops.
  static const String photoBlobs = 'photo_blobs';

  /// FIFO queue of pending mutations to replay against Supabase when
  /// connectivity is back. Each entry is a JSON-encoded [SyncOp].
  /// Keyed by monotonic int so insertion order survives restarts.
  static const String syncQueue = 'sync_queue';

  /// Read-side cache for prospects the rufero might need while offline
  /// (everyone with a scheduled appointment today). Keyed by prospect id.
  static const String prospectCache = 'prospect_cache';

  /// Read-side cache for appointments — the rufero loads their schedule
  /// in the morning with signal and we replay this when offline.
  static const String appointmentCache = 'appointment_cache';
}
