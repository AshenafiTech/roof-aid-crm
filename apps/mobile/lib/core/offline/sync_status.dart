/// Snapshot of the worker's state at a point in time. Streamed so the
/// UI can show a banner ("Syncing 3 items…" / "Offline · 5 pending").
class SyncStatus {
  /// True when the device currently has network. The worker keeps this
  /// in sync with `connectivity_plus`; consumers should prefer this
  /// over polling Connectivity themselves.
  final bool isOnline;

  /// True while the worker is actively draining the queue.
  final bool isDraining;

  /// Items left in the queue (including the one currently in flight).
  final int pending;

  /// The op kind currently being processed, if any. Lets the UI say
  /// "Uploading photo…" rather than a generic "Syncing".
  final String? currentKind;

  /// Last error surfaced by the worker (a network blip, a server 5xx).
  /// Cleared as soon as the next drain succeeds.
  final String? lastError;

  const SyncStatus({
    required this.isOnline,
    required this.isDraining,
    required this.pending,
    this.currentKind,
    this.lastError,
  });

  static const SyncStatus initial = SyncStatus(
    isOnline: false,
    isDraining: false,
    pending: 0,
  );

  SyncStatus copyWith({
    bool? isOnline,
    bool? isDraining,
    int? pending,
    String? Function()? currentKind,
    String? Function()? lastError,
  }) {
    return SyncStatus(
      isOnline: isOnline ?? this.isOnline,
      isDraining: isDraining ?? this.isDraining,
      pending: pending ?? this.pending,
      currentKind: currentKind != null ? currentKind() : this.currentKind,
      lastError: lastError != null ? lastError() : this.lastError,
    );
  }
}
