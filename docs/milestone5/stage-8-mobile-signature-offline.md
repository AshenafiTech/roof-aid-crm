# Stage 8 — Mobile Signature Capture + Offline Inspection Sync

**Goal:** Two intertwined deliverables: (a) a full-screen signature pad on mobile that mirrors the web flow, calling Stage 4's `embed-signature`; and (b) an offline queue that lets Ruferos run the entire Stage 7 inspection flow with airplane mode on. Photos, the damage form, and the signature all queue locally in Hive. When the device reconnects, the queue drains in the right order: form → photos → embed-signature → document marked signed → SMS to homeowner.

**Outcome:** A rufero finishes an inspection on a 4-story roof with no signal, walks down to the truck, the phone reconnects, and 60 seconds later the office sees the signed PDF in the dashboard. Field-team trust in the app is locked in.

**Estimated time:** 2 days

---

## 1. Why offline is the hardest part of M5

Online happy paths look the same on every platform. Offline failure modes are unique to each:

- Hive corruption mid-write.
- Storage upload retry exhausting battery.
- Photo file paths that drift when the OS clears the app's temp dir.
- Token expiry between capture and sync.
- Conflicting writes from web admin during the sync window.

Stage 8 is the only stage that materially changes whether real Ruferos will use the app.

---

## 2. Database — no schema changes

All DB shapes were finalized in Stages 1–4 and 7. Stage 8 is mobile-only.

---

## 3. Local persistence — Hive boxes

```
inspection_drafts        ← Box<InspectionDraftHive>   keyed by appointmentId
pending_photos           ← Box<PendingPhotoHive>      keyed by photoId
pending_signatures       ← Box<PendingSignatureHive>  keyed by documentId
sync_state               ← Box<SyncStateHive>         singleton
```

### 3.1 Typed adapters

```dart
@HiveType(typeId: 10)
class InspectionDraftHive extends HiveObject {
  @HiveField(0) String appointmentId;
  @HiveField(1) String prospectId;
  @HiveField(2) String? roofMaterial;
  @HiveField(3) int? roofAgeYears;
  @HiveField(4) DateTime? stormDate;
  @HiveField(5) List<String> affectedAreas;
  @HiveField(6) int? severity;
  @HiveField(7) String? notes;
  @HiveField(8) bool savedRemotely;     // becomes true after RPC success
  @HiveField(9) String? remoteInspectionId;
  @HiveField(10) DateTime updatedAt;
}

@HiveType(typeId: 11)
class PendingPhotoHive extends HiveObject {
  @HiveField(0) String photoId;
  @HiveField(1) String? inspectionId;        // null until form syncs
  @HiveField(2) String localFilePath;        // app docs dir
  @HiveField(3) List<String> tags;
  @HiveField(4) double? gpsLat;
  @HiveField(5) double? gpsLng;
  @HiveField(6) DateTime takenAt;
  @HiveField(7) int attempts;
  @HiveField(8) String? lastError;
  @HiveField(9) bool uploadedToStorage;
  @HiveField(10) bool rowInserted;
}

@HiveType(typeId: 12)
class PendingSignatureHive extends HiveObject {
  @HiveField(0) String localId;
  @HiveField(1) String documentId;           // null until generate-pdf returns
  @HiveField(2) String signerName;
  @HiveField(3) String signaturePngBase64;
  @HiveField(4) String? templateKind;        // 'authorization' usually
  @HiveField(5) String prospectId;
  @HiveField(6) DateTime signedAt;
  @HiveField(7) int attempts;
  @HiveField(8) String? lastError;
}
```

Generated via `build_runner` (already in dev deps from M1).

### 3.2 File storage for photos

Photos are large (≤ 2 MB) and don't belong in Hive. Stage 7 already writes the processed JPEG to disk; Stage 8 just tracks the path:

```
{app_documents_dir}/inspection_photos/
  {photo_id}.jpg
```

Cleanup: after a `PendingPhotoHive` is fully synced (`uploadedToStorage == true && rowInserted == true`), delete both the file and the Hive row.

---

## 4. Signature pad

### 4.1 Page

```
apps/mobile/lib/features/inspection/presentation/pages/signature_capture_page.dart
```

Full-screen, landscape-friendly:

```
+-------------------------------------------------+
| ←  Get Signature                                |
+-------------------------------------------------+
|                                                  |
|                                                  |
|     [ signature pad canvas, max 75vh ]           |
|                                                  |
|                                                  |
+-------------------------------------------------+
| Signer name: [ Jane Smith                  ]    |
|              [ Clear ]    [ Confirm & Sign ]    |
+-------------------------------------------------+
```

### 4.2 Library

`signature` package (pub.dev) — pure Dart canvas painter, MIT, ~30k downloads/month.

```yaml
# pubspec.yaml
dependencies:
  signature: ^5.5.0
```

```dart
final controller = SignatureController(
  penStrokeWidth: 3,
  penColor: const Color(0xFF111827),    // gray-900
  exportBackgroundColor: Colors.transparent,
);

Signature(
  controller: controller,
  width: double.infinity,
  height: 400,
  backgroundColor: Colors.white,
);
```

### 4.3 Capture flow

```dart
Future<void> _onConfirm() async {
  if (controller.isEmpty || _signerName.isEmpty) return;

  final png = await controller.toPngBytes();           // Uint8List
  if (png == null) return;
  final base64 = base64Encode(png);

  final bloc = context.read<SignatureBloc>();
  bloc.add(SignatureSubmitted(
    prospectId: widget.prospectId,
    inspectionId: widget.inspectionId,
    signerName: _signerName.trim(),
    signaturePngBase64: base64,
  ));
}
```

### 4.4 Online vs offline

`SignatureBloc`'s `_onSubmitted`:

```dart
Future<void> _onSubmitted(SignatureSubmitted event, Emitter<SignatureState> emit) async {
  emit(const SignatureSaving());

  // 1. Always persist locally first (offline-safe).
  final pending = PendingSignatureHive(
    localId: uuidV4(),
    documentId: null,            // we don't have it yet — generate-pdf hasn't run
    signerName: event.signerName,
    signaturePngBase64: event.signaturePngBase64,
    templateKind: 'authorization',
    prospectId: event.prospectId,
    signedAt: DateTime.now(),
    attempts: 0,
  );
  await _pendingSignaturesBox.put(pending.localId, pending);

  // 2. Kick the sync worker (best-effort).
  _syncWorker.trigger();

  // 3. UI: optimistic success — "Pending sync" if offline, "Synced!" once worker finishes.
  emit(const SignatureSavedLocally());
}
```

---

## 5. Sync worker

The single place that drains the queues. One instance, lives at the app level (registered in `injection_container.dart` as a lazy singleton).

```dart
// lib/core/sync/sync_worker.dart
class SyncWorker {
  final Connectivity _connectivity;
  final Box<InspectionDraftHive> _drafts;
  final Box<PendingPhotoHive> _photos;
  final Box<PendingSignatureHive> _sigs;
  final InspectionRemoteDatasource _inspections;
  final DocumentRemoteDatasource _documents;
  Timer? _retryTimer;
  bool _running = false;

  SyncWorker(this._connectivity, ...) {
    _connectivity.onConnectivityChanged.listen((status) {
      if (status != ConnectivityResult.none) trigger();
    });
  }

  void trigger() {
    if (_running) return;
    _running = true;
    _runSweep().whenComplete(() {
      _running = false;
      _scheduleRetry();
    });
  }

  Future<void> _runSweep() async {
    // Order is important: form before photos, photos before signature.
    await _drainInspectionDrafts();
    await _drainPendingPhotos();
    await _drainPendingSignatures();
  }

  void _scheduleRetry() {
    _retryTimer?.cancel();
    final hasWork = _drafts.values.any((d) => !d.savedRemotely) ||
                    _photos.isNotEmpty ||
                    _sigs.isNotEmpty;
    if (!hasWork) return;

    // Exponential backoff: 10s → 30s → 2m → 10m → 30m, capped.
    final maxAttempts = [..._photos.values.map((p) => p.attempts),
                         ..._sigs.values.map((s) => s.attempts)].fold(0, math.max);
    final delay = _backoff(maxAttempts);
    _retryTimer = Timer(delay, trigger);
  }

  Duration _backoff(int attempts) {
    const ladder = [10, 30, 120, 600, 1800];
    final i = math.min(attempts, ladder.length - 1);
    return Duration(seconds: ladder[i]);
  }
}
```

### 5.1 Drain inspection drafts

```dart
Future<void> _drainInspectionDrafts() async {
  for (final draft in _drafts.values.where((d) => !d.savedRemotely).toList()) {
    try {
      final saved = await _inspections.saveDraft(draft.toFormData(), draft.appointmentId);
      draft
        ..savedRemotely = true
        ..remoteInspectionId = saved.id;
      await draft.save();

      // Now we have inspectionId — backfill any photos waiting for it.
      for (final p in _photos.values.where((p) => p.inspectionId == null
                                              && p.prospectId == draft.prospectId)) {
        p.inspectionId = saved.id;
        await p.save();
      }
    } on NetworkException {
      return;   // bail the sweep — try again on retry
    } catch (e) {
      // Non-network error: log, mark draft with lastError, continue (don't loop forever).
      print('draft sync failed: $e');
    }
  }
}
```

### 5.2 Drain photos

```dart
Future<void> _drainPendingPhotos() async {
  for (final p in _photos.values.toList()) {
    if (p.inspectionId == null) continue;        // waits for form sync
    if (p.attempts >= 5) continue;               // give up; surface in UI

    try {
      final file = File(p.localFilePath);
      final bytes = await file.readAsBytes();
      await _inspections.uploadPhoto(
        photoId: p.photoId,
        inspectionId: p.inspectionId!,
        bytes: bytes,
        tags: p.tags,
        lat: p.gpsLat,
        lng: p.gpsLng,
      );
      // Success: clean up.
      await file.delete();
      await p.delete();
    } on NetworkException {
      return;
    } catch (e) {
      p.attempts++;
      p.lastError = e.toString();
      await p.save();
    }
  }
}
```

### 5.3 Drain signatures (the most complex)

A signature draws an entire downstream pipeline:

1. Ensure a `documents` row of `template_kind = 'authorization'` exists for this prospect (created via `generate-pdf`).
2. Call `embed-signature` with the queued PNG.
3. Mark the pending row complete.

```dart
Future<void> _drainPendingSignatures() async {
  for (final s in _sigs.values.toList()) {
    if (s.attempts >= 5) continue;

    try {
      // 1. Generate the unsigned document if we don't have one.
      var documentId = s.documentId;
      if (documentId == null) {
        final doc = await _documents.generatePdf(
          prospectId: s.prospectId,
          templateKind: s.templateKind ?? 'authorization',
        );
        documentId = doc.id;
        s.documentId = documentId;
        await s.save();
      }

      // 2. Embed signature.
      await _documents.embedSignature(
        documentId: documentId,
        signaturePngBase64: s.signaturePngBase64,
        signerName: s.signerName,
        deviceType: 'mobile_android',     // or ios in future
      );

      // 3. Done.
      await s.delete();
    } on NetworkException {
      return;
    } catch (e) {
      s.attempts++;
      s.lastError = e.toString();
      await s.save();
    }
  }
}
```

---

## 6. UI sync indicator

A single chip in the app's bottom bar (or top app bar):

```
✓ All synced                ← green
⟳ Syncing 3 items…          ← amber, with progress count
⚠ 1 item failed — Retry     ← red, tap → SyncWorker.trigger(force: true)
```

Implementation: `SyncIndicatorBloc` subscribes to a `Stream<SyncStatus>` from `SyncWorker`. `SyncStatus` is computed from the box lengths + connectivity state, debounced 250ms.

---

## 7. Conflict policy (last-write-wins + audit)

Edge case: admin on web edits an inspection's `scope_notes` while the rufero is offline and edits the same field. On sync, the rufero's write goes through and wipes the admin's. Both writes get logged to `activities`:

```sql
INSERT INTO activities (prospect_id, actor_id, action, metadata)
VALUES (
  prospect_id,
  rufero_id,
  'inspection_updated',
  jsonb_build_object(
    'inspection_id', inspection_id,
    'source', 'mobile_offline_sync',
    'overwrote_field', 'scope_notes',
    'previous_value_hash', md5(old_value),     -- for audit if recovery needed
    'previous_actor', 'admin_or_other'
  )
);
```

The rufero never sees a conflict dialog. The admin sees the new value next time they refresh, with an "Edited by Carlos (rufero) at 2:47 PM" attribution.

Field UX rule: **never** block on a conflict dialog. Even one ever is too many.

> M7 ships an admin "Conflict log" view that lists these auto-overwrites. M5 just makes sure the activity row exists.

---

## 8. Token / session handling

Sync may happen 6 hours after the inspection captured (rufero offline overnight). The Supabase session might be expired. The remote datasources must:

1. Catch 401s from the API.
2. Call `supabase.auth.refreshSession()`.
3. Retry once.
4. If still 401, mark the pending items with `lastError = 'auth_required'` and surface a system snackbar prompting the rufero to re-login. Do not delete pending data — they re-login and the next sweep drains the queue.

---

## 9. Acceptance criteria

### Signature
- [ ] Stage 7 "Save & Continue" navigates to the signature page
- [ ] Pad accepts touch and stylus; lines smooth on a mid-range Android
- [ ] Clear works
- [ ] Confirm disabled until pad has strokes + signer name is non-empty
- [ ] Online: Confirm → within 5s, document appears signed on web
- [ ] Offline: Confirm → "Signature saved locally — will sync on reconnect" → returns to My Schedule

### Offline end-to-end
- [ ] Airplane mode → start inspection → take 5 photos with tags → fill damage form → save → sign → confirm
- [ ] Force-quit the app at every step → reopen → all data still there
- [ ] Disable airplane mode → within 60 seconds: form synced, 5 photos uploaded, document generated, document signed, homeowner emailed
- [ ] During sync: indicator shows "Syncing 7 items…" → "All synced"
- [ ] Web dashboard refreshes (existing realtime) and shows the signed document with the signature embedded
- [ ] Photos cap retry at 5 attempts; failed photos show "1 photo failed — Retry" with a working retry button
- [ ] Session expiry mid-sync → user prompted to re-login → data still intact → next sync completes

### Conflict + audit
- [ ] Admin edits inspection notes while rufero is offline → rufero's offline write wins on sync
- [ ] An `activities` row records the overwrite with `source='mobile_offline_sync'`
- [ ] No conflict dialog shown to the rufero

### Cross-cutting
- [ ] No data loss across app kill / reinstall / OS reboot (Hive persistence)
- [ ] No duplicate uploads after a successful sync (each photo's row stays unique)
- [ ] Battery drain test: 1 hour idle with 5 queued photos and no network → device drains < 3% extra (backoff is working)
- [ ] Storage cleanup: after successful sync, local JPEGs deleted from app docs dir
- [ ] Hive box size doesn't grow unbounded across many inspections (verify deletion)

---

## 10. Pitfalls to avoid

- **Don't** use `await` on the sync trigger from BLoCs — fire and forget. The UI returns immediately; the sync worker reports back via its own stream.
- **Don't** put PNGs in Hive. They balloon the box file. Base64 strings as Hive values are OK for signatures (~30 KB each, single-digit per inspection); for photos use disk + `localFilePath`.
- **Don't** assume `localFilePath` survives app updates. Use `path_provider`'s `getApplicationDocumentsDirectory()` (persistent) not `getTemporaryDirectory()` (purged by OS).
- **Don't** retry on **non-network** errors. A 4xx from the server means the request is invalid; retrying won't help and burns battery. Inspect error types.
- **Don't** block the UI on a sync sweep. Worker runs in the background; UI subscribes to its status stream.
- **Don't** show a conflict resolution dialog. Last-write-wins is the design choice (5.7 in README); audit it instead.
- **Don't** sync signatures before their photos. The signed PDF references the same inspection; if the inspection isn't there yet, the doc generation will succeed but the inspection link is broken. Order: drafts → photos → signatures.
- **Don't** silently swallow `auth_required`. Show the re-login prompt prominently; the rufero may not realize their session expired.
- **Don't** assume the `tenant_id` is available offline from `auth.currentUser`. Cache it on login into a small Hive box (`session_state`) so the queue can construct correct paths offline.
- **Don't** trigger sync on **every** connectivity change without debouncing. Phones flap between Wi-Fi and 4G constantly; flap-storms can stack worker invocations. Debounce 2s.
- **Don't** delete the local JPEG until both the storage upload and the row update succeed. A storage-only success with a row-update failure means we have orphan bytes.

---

## 11. What ships at end of Stage 8

- 3 Hive boxes + typed adapters: drafts, photos, signatures
- 1 `SyncWorker` singleton with sweep + exponential-backoff retry
- 1 `SignatureCapturePage` + `signature` package dep
- 1 `SyncIndicator` widget in the app shell
- Auth-refresh handling for 401s mid-sync
- Conflict logging in `activities` with `source='mobile_offline_sync'`
- File-cleanup pass on successful sync
- Updated `injection_container.dart` registrations for boxes + worker
- Manifest entry: foreground service permission (Android) if the sync should survive backgrounding for >30s (optional for M5, recommended for M6)

End of Milestone 5. The platform now closes deals end-to-end.
