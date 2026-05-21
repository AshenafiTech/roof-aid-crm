# Stage 2 — Photo Upload Pipeline

**Depends on:** Stage 1 (sync engine + Hive infrastructure), M5 Stage 7 (inspection photo write path).
**Blocks:** nothing directly; required for M6 DoD.
**Estimated:** 1.5 days.

## Purpose

Guarantee that a photo taken in the field reaches Supabase Storage eventually, no matter what — app kill, OS update, low battery, intermittent connectivity. M5 added the happy path; M6 makes it durable.

## Scope

### 2.1 `PendingPhoto` Hive type

```dart
@HiveType(typeId: 34)
class PendingPhoto {
  @HiveField(0) String id;                  // uuid v4, used as Storage key
  @HiveField(1) String tenantId;
  @HiveField(2) String inspectionId;
  @HiveField(3) String prospectId;
  @HiveField(4) String localPath;           // absolute path to the compressed jpeg
  @HiveField(5) List<String> tags;          // photo type tags
  @HiveField(6) double? latitude;
  @HiveField(7) double? longitude;
  @HiveField(8) DateTime capturedAt;
  @HiveField(9) DateTime createdAt;         // queue time
  @HiveField(10) int attemptCount;
  @HiveField(11) String? lastError;
  @HiveField(12) String status;             // 'pending' | 'uploading' | 'uploaded' | 'hard_error'
  @HiveField(13) double progress;           // 0.0–1.0, last reported
  @HiveField(14) int version = 1;
}
```

### 2.2 Photo runner

Subclass of `SyncRunner` (Stage 1) specialized for binary uploads:

- Reads `localPath` from disk via `path_provider`.
- Uses Supabase `storage.from('inspection-photos').uploadBinary()` with `onUploadProgress` callback → writes `progress` to Hive (throttled to once every 250ms).
- On success → insert row into `photos` table → mark `PendingPhoto.status = 'uploaded'` → delete local file → remove from queue 24h later (kept briefly for audit).
- On HTTP 4xx (client error) → mark `hard_error` immediately, no retry. 5xx / network → backoff per Stage 1's schedule.
- Concurrency: 1 upload at a time per device. Photos are large; serialization keeps mobile data + battery under control.

### 2.3 Capture pipeline

`InspectionPhotoBloc.capture(...)`:
1. Receive photo from `image_picker`.
2. Compress to ≤ 2 MB (`flutter_image_compress`) — already wired in M5.
3. Move file to `${appDocumentsDir}/photos/${uuid}.jpg`. App-private; survives reboot.
4. Insert `PendingPhoto` into queue with `status: 'pending'`.
5. UI shows the photo immediately with a "Pending sync" badge.
6. Runner picks it up (no UI wait).

### 2.4 UI affordances

- **Per-photo badge** — "Uploading… 47%", "Uploaded", "Pending sync", "Retry".
- **Inspection-level summary** — "5 of 7 uploaded — sync pending."
- **Manual retry button** appears on any photo with `attemptCount ≥ 1` and `status ∈ {pending, hard_error}`.
- **Hard-error explainer** — on tap of a `hard_error` photo: "This photo couldn't upload after 24 hours. The original file is still on your device. [Retry now] [Save to gallery] [Contact support]."

### 2.5 Soft cap

If `PendingPhoto` count > 200 across all inspections → show banner in app shell: "200+ photos waiting to upload. Find Wi-Fi or a hotspot to drain the queue." Photos still take, still queue. The cap is informational, not blocking.

### 2.6 Storage cleanup

`localPath` is deleted only after a successful upload + a successful `photos` row insert. Until both, the file stays. On app launch, the runner reconciles: any `PendingPhoto` whose `localPath` doesn't exist on disk → mark `hard_error` ("File missing — likely cleared by OS").

## Verification

1. Offline → take 10 photos → all 10 in Hive with `status: 'pending'`
2. Enable network → queue drains serially; per-photo progress visible; all 10 reach Storage in ≤ 90s on 4G; corresponding `photos` rows exist
3. Force a 500 mid-upload (e.g., a test middleware that fails the 4th upload once) → photo 4 retries with backoff; eventually succeeds
4. Force a 401 (invalid JWT scenario) → photo marked `hard_error` immediately; tapping it shows the retry path
5. Kill app while photo 6 of 10 is uploading at 60% → relaunch → photo 6 either re-uploaded fresh (resets to 0%) or completes; never duplicated; final `photos` count == 10
6. Take 5 photos offline → cold-launch the app a few hours later → photos still present, status still `pending`; network restored → all 5 upload
7. Take 1 photo → manually delete its `localPath` from `${appDocumentsDir}/photos/` via debug tool → reopen app → photo marked `hard_error` with "File missing" reason

## Files

### Created
- `apps/mobile/lib/core/offline/models/pending_photo.dart`
- `apps/mobile/lib/core/offline/runners/photo_runner.dart`
- `apps/mobile/lib/features/inspection/data/photo_local_store.dart`
- `apps/mobile/lib/features/inspection/presentation/widgets/photo_status_badge.dart`
- `apps/mobile/lib/features/inspection/presentation/widgets/photo_hard_error_dialog.dart`

### Modified
- `apps/mobile/lib/features/inspection/data/repositories/inspection_repository.dart` — capture pipeline
- `apps/mobile/lib/features/inspection/presentation/bloc/inspection_photo_bloc.dart` — drive `PendingPhoto` queue
- `apps/mobile/lib/features/inspection/presentation/pages/inspection_page.dart` — render badges + retry

## Out of scope
- Photo annotation / drawing → M-future
- Cloud-side virus scan → M8 security pass
- Auto-rotate / EXIF normalization beyond M5's basic compression → M7
