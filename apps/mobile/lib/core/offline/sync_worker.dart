import 'dart:async';
import 'dart:developer' as developer;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import 'hive_boxes.dart';
import 'sync_op.dart';
import 'sync_status.dart';

/// Handler function for a single op kind. Returns normally on success,
/// throws on failure (the worker handles retry/backoff). Feature repos
/// register their handlers in DI; the worker stays domain-agnostic.
typedef SyncHandler = Future<void> Function(SyncOp op);

/// Singleton service that owns the offline mutation queue. Wired up
/// in [initDependencies] and lives for the whole app lifetime.
///
/// Lifecycle:
///   1. App boot → [start] opens the queue box + subscribes to
///      connectivity.
///   2. Feature repos enqueue ops via [enqueue] whenever a write
///      fails due to offline (or unconditionally, if we want strict
///      local-first writes).
///   3. Connectivity flips online → [_tryDrain] runs the queue in FIFO
///      order, retrying with exponential backoff on transient errors.
///
/// Handler registry is intentionally lazy: features register their
/// handlers when their repo is constructed, so the worker doesn't
/// need to import every feature.
class SyncWorker {
  final Connectivity _connectivity;
  final Map<String, SyncHandler> _handlers = {};
  final _statusController = StreamController<SyncStatus>.broadcast();
  final _uuid = const Uuid();

  /// In-memory mirror of the queue box. Hive's `keys` are monotonic
  /// ints — we use the same key for the on-disk row and the in-memory
  /// list so insertion order is preserved across restarts.
  Box<String>? _queueBox;
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  Timer? _retryTimer;

  bool _starting = false;
  bool _started = false;
  bool _draining = false;

  SyncStatus _status = SyncStatus.initial;
  SyncStatus get status => _status;
  Stream<SyncStatus> get statusStream => _statusController.stream;

  SyncWorker(this._connectivity);

  /// Open the Hive queue + start listening for connectivity changes.
  /// Safe to call multiple times (no-op after the first success).
  Future<void> start() async {
    if (_started || _starting) return;
    _starting = true;
    try {
      _queueBox = await Hive.openBox<String>(HiveBoxes.syncQueue);

      final initial = await _connectivity.checkConnectivity();
      _emit(_status.copyWith(
        isOnline: _isOnline(initial),
        pending: _queueBox!.length,
      ));

      _connSub = _connectivity.onConnectivityChanged.listen((results) {
        final online = _isOnline(results);
        _emit(_status.copyWith(isOnline: online));
        if (online) unawaited(_tryDrain());
      });

      _started = true;
      // If we booted with signal, drain anything from the previous run.
      if (_status.isOnline && _queueBox!.isNotEmpty) {
        unawaited(_tryDrain());
      }
    } finally {
      _starting = false;
    }
  }

  /// Register a handler for an op kind. Called once per feature repo
  /// during DI wiring. Later registrations replace earlier ones (which
  /// lets us swap test fakes in).
  void registerHandler(String kind, SyncHandler handler) {
    _handlers[kind] = handler;
  }

  /// Enqueue an op. Returns the persisted [SyncOp] (with its generated
  /// id) so callers can correlate UI state to a queue entry.
  ///
  /// When [dedupKey] is set, any existing un-drained op with the same
  /// (kind, dedupKey) is removed first — useful for "sync inspection X"
  /// style ops where only the latest state matters. Saves us draining
  /// a thousand duplicate writes after a typing burst.
  ///
  /// Triggers an immediate drain attempt — if we happen to be online,
  /// the op runs right away and never hits disk for more than a moment.
  Future<SyncOp> enqueue({
    required String kind,
    required Map<String, dynamic> payload,
    String? dedupKey,
  }) async {
    await start();

    if (dedupKey != null) {
      // Walk the box and drop any prior op with the same kind + key.
      // Box is small (typically <100 entries even after a long offline
      // stretch), so the scan is negligible.
      final toDelete = <dynamic>[];
      for (final key in _queueBox!.keys) {
        final raw = _queueBox!.get(key);
        if (raw == null) continue;
        try {
          final existing = SyncOp.decode(raw);
          if (existing.kind == kind && existing.dedupKey == dedupKey) {
            toDelete.add(key);
          }
        } catch (_) {
          // Corrupt row — leave for the drain loop to clean up.
        }
      }
      for (final k in toDelete) {
        await _queueBox!.delete(k);
      }
    }

    final op = SyncOp(
      id: _uuid.v4(),
      kind: kind,
      payload: payload,
      createdAt: DateTime.now(),
      dedupKey: dedupKey,
    );
    await _queueBox!.add(op.encode());
    _emit(_status.copyWith(pending: _queueBox!.length));
    if (_status.isOnline) unawaited(_tryDrain());
    return op;
  }

  /// Drain the queue until empty or a non-retryable failure is hit.
  /// Safe to call concurrently — re-entries return immediately while
  /// another drain is in flight.
  Future<void> _tryDrain() async {
    if (_draining) return;
    if (_queueBox == null || _queueBox!.isEmpty) return;
    if (!_status.isOnline) return;

    _draining = true;
    _emit(_status.copyWith(isDraining: true, lastError: () => null));

    try {
      while (_queueBox!.isNotEmpty && _status.isOnline) {
        final firstKey = _queueBox!.keys.first;
        final raw = _queueBox!.get(firstKey);
        if (raw == null) {
          // Box mutated under us — skip and continue.
          await _queueBox!.delete(firstKey);
          continue;
        }

        SyncOp op;
        try {
          op = SyncOp.decode(raw);
        } catch (e) {
          // Corrupt entry — drop it so it doesn't block the queue.
          developer.log(
            'Dropping corrupt sync op: $e',
            name: 'sync-worker',
          );
          await _queueBox!.delete(firstKey);
          continue;
        }

        final handler = _handlers[op.kind];
        if (handler == null) {
          // No registered handler — leave it in place. This is a
          // programmer error (forgot to register), not a runtime issue.
          developer.log(
            'No handler for sync op kind: ${op.kind}. Skipping for now.',
            name: 'sync-worker',
          );
          break;
        }

        _emit(_status.copyWith(currentKind: () => op.kind));

        try {
          await handler(op);
          await _queueBox!.delete(firstKey);
          _emit(_status.copyWith(
            pending: _queueBox!.length,
            currentKind: () => null,
            lastError: () => null,
          ));
        } catch (e) {
          // Increment attempts; if it crosses our backoff thresholds
          // we pause and schedule a retry. We never permanently drop
          // an op from here — the user can clear it from a debug UI.
          final next = op.copyWith(
            attempts: op.attempts + 1,
            lastError: () => e.toString(),
          );
          await _queueBox!.put(firstKey, next.encode());
          _emit(_status.copyWith(
            currentKind: () => null,
            lastError: () => e.toString(),
          ));
          _scheduleRetry(next.attempts);
          break;
        }
      }
    } finally {
      _draining = false;
      _emit(_status.copyWith(isDraining: false));
    }
  }

  /// Schedule another drain attempt with exponential backoff capped at
  /// 30 seconds. We rely on connectivity-change events for the "back
  /// online" case; this timer is for transient server-side failures
  /// where we're online but the API is misbehaving.
  void _scheduleRetry(int attempts) {
    _retryTimer?.cancel();
    final secs = (1 << (attempts - 1)).clamp(1, 30);
    _retryTimer = Timer(Duration(seconds: secs), () {
      if (_status.isOnline) unawaited(_tryDrain());
    });
  }

  bool _isOnline(List<ConnectivityResult> results) {
    return results.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet ||
        r == ConnectivityResult.vpn);
  }

  void _emit(SyncStatus next) {
    _status = next;
    _statusController.add(next);
  }

  /// Mostly for tests + debug UI. Production code should never need
  /// to inspect raw queue contents.
  List<SyncOp> debugPeek() {
    final box = _queueBox;
    if (box == null) return const [];
    return box.values.map(SyncOp.decode).toList(growable: false);
  }

  Future<void> close() async {
    await _connSub?.cancel();
    _retryTimer?.cancel();
    await _statusController.close();
  }
}
