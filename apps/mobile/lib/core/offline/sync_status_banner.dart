import 'package:flutter/material.dart';

import '../di/injection_container.dart';
import 'sync_status.dart';
import 'sync_worker.dart';

/// Thin status strip rendered above the main shell. Visible only when
/// there's something worth telling the user about — offline state,
/// in-flight drain, or items waiting in the queue. Stays out of the
/// way the rest of the time (renders an empty 0-height SizedBox).
///
/// Colors track the situation:
///   - amber  → online, draining (work in flight)
///   - orange → offline, items queued ("you'll catch up when you're back")
///   - grey   → offline, queue empty (informational)
///
/// When there's pending work and we're online, the banner also exposes
/// a "Sync now" affordance — the worker drains automatically on
/// connectivity changes, but a manual button is reassurance for a
/// rufero who just got back into signal and wants visible progress.
class SyncStatusBanner extends StatelessWidget {
  const SyncStatusBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final worker = sl<SyncWorker>();
    return StreamBuilder<SyncStatus>(
      stream: worker.statusStream,
      initialData: worker.status,
      builder: (context, snap) {
        final s = snap.data ?? SyncStatus.initial;
        // Nothing to say — fully online with an empty queue.
        if (s.isOnline && s.pending == 0 && !s.isDraining) {
          return const SizedBox.shrink();
        }
        return _Banner(status: s, worker: worker);
      },
    );
  }
}

class _Banner extends StatelessWidget {
  final SyncStatus status;
  final SyncWorker worker;
  const _Banner({required this.status, required this.worker});

  @override
  Widget build(BuildContext context) {
    final (bg, icon, label) = _palette();
    final subtitle = _subtitle();
    final canSyncNow =
        status.isOnline && status.pending > 0 && !status.isDraining;

    return Material(
      color: bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              if (status.isDraining)
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.8,
                    color: Colors.white,
                  ),
                )
              else
                Icon(icon, size: 14, color: Colors.white),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              if (canSyncNow) ...[
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => worker.drainNow(),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 28),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10),
                    textStyle: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  child: const Text('Sync now'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  (Color bg, IconData icon, String label) _palette() {
    if (status.isDraining) {
      final kindLabel = _kindLabel(status.currentKind);
      final tail = status.pending > 1 ? ' · ${status.pending} pending' : '';
      return (
        const Color(0xFFD97706),
        Icons.sync,
        'Syncing $kindLabel$tail',
      );
    }
    if (!status.isOnline && status.pending > 0) {
      return (
        const Color(0xFFEA580C),
        Icons.cloud_off_outlined,
        'Offline · ${status.pending} item${status.pending == 1 ? '' : 's'} '
            "queued · will sync when you're back online",
      );
    }
    if (!status.isOnline) {
      return (
        const Color(0xFF6B7280),
        Icons.cloud_off_outlined,
        "You're offline · changes will sync when you reconnect",
      );
    }
    return (
      const Color(0xFFD97706),
      Icons.sync_outlined,
      '${status.pending} item${status.pending == 1 ? '' : 's'} waiting to sync',
    );
  }

  /// Second-line caption — almost always the last-synced age. Returns
  /// null when there's nothing useful to add (e.g. the rufero hasn't
  /// synced anything yet, so saying "0 minutes ago" would be a lie).
  String? _subtitle() {
    final at = status.lastSyncedAt;
    if (at == null) return null;
    return 'Last synced ${_age(DateTime.now().difference(at))}';
  }

  String _age(Duration d) {
    if (d.inSeconds < 60) return 'just now';
    if (d.inMinutes < 60) {
      final m = d.inMinutes;
      return '$m minute${m == 1 ? '' : 's'} ago';
    }
    if (d.inHours < 24) {
      final h = d.inHours;
      return '$h hour${h == 1 ? '' : 's'} ago';
    }
    final days = d.inDays;
    return '$days day${days == 1 ? '' : 's'} ago';
  }

  String _kindLabel(String? kind) {
    switch (kind) {
      case 'inspection_form_patch':
        return 'inspection form';
      case 'photo_upload':
        return 'photo';
      case 'photo_tag_update':
        return 'photo tags';
      case 'photo_delete':
        return 'photo delete';
      case 'embed_signature':
        return 'signature';
      case 'appointment_transition':
        return 'appointment update';
      case 'note_add':
        return 'note';
      case 'note_update':
        return 'note edit';
      case 'note_delete':
        return 'note delete';
      default:
        return 'changes';
    }
  }
}
