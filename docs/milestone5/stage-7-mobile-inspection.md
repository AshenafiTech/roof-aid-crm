# Stage 7 — Mobile Inspection Screen + Damage Form

**Goal:** On mobile, the rufero opens an assigned appointment, taps **Start Inspection**, and lands on a single screen built for the rooftop: a camera button, a list of tagged photos, a short damage form, and a save action. Photos are GPS-tagged and compressed to ≤ 2 MB. The damage form writes one `inspection_reports` row. Photos write one `photos` row each + binary to the `inspection-photos` Storage bucket.

**Outcome:** A rufero can document a complete inspection in under 4 minutes on a phone, in sunlight, in gloves. The on-rooftop UX is the make-or-break of the whole field experience.

**Estimated time:** 2 days

---

## 1. Why this stage matters

The mobile app exists for this screen. If photo capture is slow, lossy, or duplicates metadata fields the rufero has to re-enter, the field team drops the app and goes back to texting their boss. M5 succeeds or fails on Stage 7's UX.

Note: **Stage 7 ships online-first**. Offline sync, retry, and queue management are **Stage 8**. We build the happy path here so Stage 8 only adds the queue layer.

---

## 2. Database changes

### 2.1 Migration: `0XX_m5_inspections.sql`

`inspection_reports` already exists from M1 schema. Stage 7 firms up the column set:

```sql
ALTER TABLE inspection_reports
  ADD COLUMN IF NOT EXISTS roof_age_years int,
  ADD COLUMN IF NOT EXISTS roof_material text,   -- 'asphalt_shingle', 'metal', 'tile', 'flat', 'other'
  ADD COLUMN IF NOT EXISTS storm_date date,
  ADD COLUMN IF NOT EXISTS affected_areas text[],   -- ['roof','gutters','siding','windows','hvac','chimney','skylights','garage','fence','other']
  ADD COLUMN IF NOT EXISTS severity int CHECK (severity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS scope_notes text,
  ADD COLUMN IF NOT EXISTS photo_count_expected int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX inspection_reports_appointment_idx
  ON inspection_reports (appointment_id);
```

### 2.2 Migration: `0XX_m5_inspection_photos.sql`

```sql
CREATE TABLE IF NOT EXISTS photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inspection_id       uuid REFERENCES inspection_reports(id) ON DELETE CASCADE,
  prospect_id         uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  storage_path        text NOT NULL,            -- {tenant}/inspections/{inspection_id}/{photo_id}.jpg
  tags                text[] NOT NULL,           -- ['overview', 'front', 'close_up_damage', ...]
  gps_lat             double precision,
  gps_lng             double precision,
  taken_at            timestamptz NOT NULL,
  uploaded_at         timestamptz,               -- null until Storage upload completes
  width_px            int,
  height_px           int,
  file_size_bytes     int,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX photos_inspection_idx ON photos (inspection_id);
CREATE INDEX photos_prospect_idx ON photos (prospect_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped, role-aware:
-- - rufero: only photos they took + photos on their assigned prospects
-- - telefonista/admin/owner: all tenant photos
CREATE POLICY photos_select_tenant ON photos FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY photos_insert_tenant ON photos FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
```

### 2.3 Photo tags

Canonical list (kept in sync with the mobile app's `photo_tags.dart`):

```
overview, front, back, left_side, right_side,
close_up_damage, gutters, chimney, skylights, hvac, siding,
evidence, other
```

Multi-select. At least one required when saving a photo.

### 2.4 Storage layout

```
inspection-photos/                              ← bucket (M1)
  {tenant_id}/
    inspections/
      {inspection_id}/
        {photo_id}.jpg
```

JPEG only at the API layer. Mobile compresses + reencodes everything to JPEG before upload.

---

## 3. Mobile — feature folder

```
apps/mobile/lib/features/inspection/
├── domain/
│   ├── entities/
│   │   ├── inspection_entity.dart
│   │   ├── photo_entity.dart
│   │   └── photo_tag.dart
│   ├── repositories/
│   │   └── inspection_repository.dart
│   └── usecases/
│       ├── start_inspection.dart
│       ├── save_inspection_report.dart
│       ├── add_photo_to_inspection.dart
│       └── complete_inspection.dart
├── data/
│   ├── models/
│   │   ├── inspection_model.dart
│   │   └── photo_model.dart
│   ├── datasources/
│   │   ├── inspection_remote_datasource.dart
│   │   └── photo_processor.dart        # compression, EXIF strip
│   └── repositories/
│       └── inspection_repository_impl.dart
└── presentation/
    ├── bloc/
    │   ├── inspection_bloc.dart
    │   ├── inspection_event.dart
    │   └── inspection_state.dart
    ├── pages/
    │   ├── inspection_page.dart
    │   └── photo_capture_page.dart
    └── widgets/
        ├── photo_grid.dart
        ├── photo_tag_selector.dart
        └── damage_form.dart
```

> Mirrors the prospects module layout exactly. Same conventions for `dartz` Either, sealed events/states, etc.

---

## 4. Entry point: appointment → inspection

The "My Schedule" page (Stage 2) shows each appointment with a `Start Inspection` button when `status='confirmed'` and `scheduled_at` is within ±2h of now.

Tap → `InspectionPage` opens with the appointment + prospect context. If the appointment already has an `inspection_reports` row (rufero came back to edit), load it; otherwise start a fresh draft.

```dart
// pages/inspection_page.dart
class InspectionPage extends StatelessWidget {
  final String appointmentId;
  const InspectionPage({super.key, required this.appointmentId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<InspectionBloc>()
        ..add(InspectionLoadRequested(appointmentId: appointmentId)),
      child: const _InspectionView(),
    );
  }
}
```

---

## 5. UI — single screen

```
+---------------------------------------+
| ← Carlos Ramirez (prospect name)      |  ← top bar
|   2:00 PM today                       |
+---------------------------------------+
|  Photos (3)                           |  ← section header
|  +-------+ +-------+ +-------+ +---+ |
|  |       | |       | |       | | + | |
|  |[image]| |[image]| |[image]| |   | |
|  | front | |close_up_damage| | gutters| |   | |
|  +-------+ +-------+ +-------+ +---+ |
|                                       |
|  Damage report                        |
|  Roof age:    [____] years            |
|  Material:    ◉ Asphalt  ○ Metal ...  |
|  Storm date:  [ Apr 14, 2026 ]        |
|  Affected:    ▢ Roof ▣ Gutters ...    |
|  Severity:    ◯◯◯●◯ (4/5)            |
|  Notes:       [____________________]  |
|                                       |
|             [ Save & Continue → ]     |
+---------------------------------------+
```

Single scrollable view. Save & Continue advances to the signature page (Stage 8).

### 5.1 Photo grid

`<PhotoGrid />`:
- 3-column grid of thumbnails (4 on tablets).
- Last cell is always the **+ Add photo** tile.
- Each thumbnail overlays the primary tag at the bottom (e.g., "front", "damage").
- Long-press a thumbnail → action sheet: **Retake**, **Change tags**, **Delete**.

Tap **+ Add photo** → `PhotoCapturePage`.

### 5.2 Photo capture flow

`PhotoCapturePage` opens the device camera via `image_picker.pickImage(source: ImageSource.camera, maxWidth: 1920, imageQuality: 80)`.

After capture:
1. Show a preview screen with the photo + a `PhotoTagSelector` widget (chips).
2. Rufero taps one or more tags.
3. **Save** → photo runs through `PhotoProcessor`:
   - Strip EXIF (privacy + smaller file).
   - Re-encode JPEG at quality 80.
   - Resize so the long edge is 1920px max.
   - Cap total file size at 2 MB; recompress at quality 65 if still over.
4. Photo row inserted (`uploaded_at = null` initially), upload starts in background.
5. Return to inspection screen. Thumbnail appears in the grid.

```dart
// data/datasources/photo_processor.dart
class PhotoProcessor {
  Future<Uint8List> process(File source) async {
    final bytes = await source.readAsBytes();
    final image = img.decodeImage(bytes)!;
    final resized = image.width > 1920 || image.height > 1920
      ? img.copyResize(image, width: image.width > image.height ? 1920 : null,
                              height: image.height >= image.width ? 1920 : null)
      : image;

    var jpegBytes = img.encodeJpg(resized, quality: 80);
    if (jpegBytes.length > 2 * 1024 * 1024) {
      jpegBytes = img.encodeJpg(resized, quality: 65);
    }
    return Uint8List.fromList(jpegBytes);
  }
}
```

> Use the `image` package (already pure Dart, no platform deps). EXIF strip is automatic via `decodeImage` + re-encode.

### 5.3 GPS tagging

Get device location at the start of each capture (not at save — Android needs the permission flow front-loaded). Add `geolocator` as a dependency.

```dart
final pos = await Geolocator.getCurrentPosition(
  desiredAccuracy: LocationAccuracy.high,
  timeLimit: const Duration(seconds: 10),
);
// → photo.gpsLat, photo.gpsLng
```

If location permission denied or times out, save photo with null GPS — don't block the capture.

### 5.4 Damage form (`<DamageForm />`)

Direct `TextEditingController` + `FormField` widgets. No external form library needed.

Validation:
- Roof age: optional, 0–100 if provided.
- Material: required.
- Storm date: optional, <= today.
- Affected areas: at least one required.
- Severity: required.
- Notes: optional, <= 1000 chars.

`Save & Continue` disabled until required fields are valid AND at least 1 photo is in the grid.

Required-photo policy: enforce **at least 3 photos** with at least one tagged `overview` and at least one tagged `close_up_damage` — this prevents incomplete reports. Show inline guidance ("Add an overview photo to continue") if missing.

---

## 6. BLoC

```dart
// bloc/inspection_event.dart
sealed class InspectionEvent { const InspectionEvent(); }
class InspectionLoadRequested extends InspectionEvent {
  final String appointmentId;
  const InspectionLoadRequested({required this.appointmentId});
}
class InspectionPhotoAdded extends InspectionEvent {
  final PhotoEntity photo;
  const InspectionPhotoAdded(this.photo);
}
class InspectionPhotoTagsChanged extends InspectionEvent {
  final String photoId;
  final List<String> tags;
  const InspectionPhotoTagsChanged(this.photoId, this.tags);
}
class InspectionPhotoDeleted extends InspectionEvent {
  final String photoId;
  const InspectionPhotoDeleted(this.photoId);
}
class InspectionFormChanged extends InspectionEvent {
  final InspectionFormData formData;
  const InspectionFormChanged(this.formData);
}
class InspectionSaveRequested extends InspectionEvent {
  const InspectionSaveRequested();
}
```

```dart
// bloc/inspection_state.dart
sealed class InspectionState { const InspectionState(); }
class InspectionInitial extends InspectionState { const InspectionInitial(); }
class InspectionLoading extends InspectionState { const InspectionLoading(); }
class InspectionReady extends InspectionState {
  final InspectionEntity draft;
  final List<PhotoEntity> photos;
  final bool isSaving;
  final String? lastError;
  const InspectionReady({
    required this.draft,
    required this.photos,
    this.isSaving = false,
    this.lastError,
  });

  bool get canSave =>
    draft.material != null &&
    draft.affectedAreas.isNotEmpty &&
    draft.severity != null &&
    photos.length >= 3 &&
    photos.any((p) => p.tags.contains('overview')) &&
    photos.any((p) => p.tags.contains('close_up_damage'));
}
class InspectionSaved extends InspectionState {
  final String inspectionId;
  const InspectionSaved(this.inspectionId);
}
class InspectionError extends InspectionState {
  final String message;
  const InspectionError(this.message);
}
```

BLoC's `_onSave`:
1. Emit `InspectionReady(isSaving: true)`.
2. Call `saveInspectionReport(draft)`.
3. For each photo not yet uploaded, call `addPhotoToInspection(photo)` (kicks off Storage upload).
4. On success, emit `InspectionSaved(inspectionId)`. The page navigates to signature.

---

## 7. Repository + datasource

```dart
// data/datasources/inspection_remote_datasource.dart
class InspectionRemoteDatasourceImpl implements InspectionRemoteDatasource {
  final SupabaseClient client;

  Future<InspectionModel> saveDraft(InspectionFormData data, String appointmentId) async {
    final user = client.auth.currentUser!;
    final existing = await client
      .from('inspection_reports')
      .select()
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (existing != null) {
      final updated = await client
        .from('inspection_reports')
        .update({
          'roof_age_years': data.roofAgeYears,
          'roof_material': data.material,
          'storm_date': data.stormDate?.toIso8601String().substring(0, 10),
          'affected_areas': data.affectedAreas,
          'severity': data.severity,
          'scope_notes': data.notes,
        })
        .eq('id', existing['id'])
        .select()
        .single();
      return InspectionModel.fromMap(updated);
    } else {
      final inserted = await client
        .from('inspection_reports')
        .insert({
          'tenant_id': user.userMetadata?['tenant_id'],   // or from RLS context
          'prospect_id': data.prospectId,
          'appointment_id': appointmentId,
          'rufero_id': user.id,
          'roof_age_years': data.roofAgeYears,
          'roof_material': data.material,
          'storm_date': data.stormDate?.toIso8601String().substring(0, 10),
          'affected_areas': data.affectedAreas,
          'severity': data.severity,
          'scope_notes': data.notes,
        })
        .select()
        .single();
      return InspectionModel.fromMap(inserted);
    }
  }

  Future<PhotoModel> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? lat,
    double? lng,
  }) async {
    final photoId = uuidV4();
    final tenantId = ...;
    final path = '$tenantId/inspections/$inspectionId/$photoId.jpg';

    // 1. Insert row first (so we have a stable id + can show in UI immediately).
    final inserted = await client.from('photos').insert({
      'id': photoId,
      'tenant_id': tenantId,
      'inspection_id': inspectionId,
      'prospect_id': prospectId,
      'storage_path': path,
      'tags': tags,
      'gps_lat': lat,
      'gps_lng': lng,
      'taken_at': DateTime.now().toIso8601String(),
      'file_size_bytes': bytes.length,
    }).select().single();

    // 2. Storage upload (slow path — may run in background).
    await client.storage.from('inspection-photos').uploadBinary(
      path, bytes,
      fileOptions: const FileOptions(contentType: 'image/jpeg'),
    );

    // 3. Mark uploaded.
    await client
      .from('photos')
      .update({'uploaded_at': DateTime.now().toIso8601String()})
      .eq('id', photoId);

    return PhotoModel.fromMap(inserted).copyWith(uploadedAt: DateTime.now());
  }
}
```

> Stage 7 ships this as a **synchronous** upload — `uploadPhoto` awaits the Storage write. Stage 8 wraps this in the offline queue + retry layer; the row insert (step 1) still happens immediately to keep UI feedback fast.

---

## 8. Permissions

Add to `apps/mobile/android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>
```

iOS — `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Take photos of roof damage during inspections.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save inspection photos to your library.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Tag inspection photos with GPS coordinates.</string>
```

> Reminder: iOS is deferred for this project; the strings still go in for when iOS resumes. Android is the primary surface.

---

## 9. Acceptance criteria

- [ ] Confirmed appointment within ±2h of now → **Start Inspection** button visible on My Schedule
- [ ] Tap → `InspectionPage` loads in <1s (no network roundtrip for the UI shell)
- [ ] Tap camera button → device camera opens → capture → tag selector → save → thumbnail in grid
- [ ] Photo is ≤ 2 MB on disk, JPEG, ≤ 1920px on the long edge, no EXIF
- [ ] GPS coords appear on the photo row when location permission granted
- [ ] Long-press a thumbnail → Retake / Change tags / Delete actions all work
- [ ] Damage form: Save disabled until material + ≥1 affected area + severity all set
- [ ] Photo policy: Save disabled until 3+ photos with at least one `overview` and one `close_up_damage`
- [ ] Save → `inspection_reports` row written, all queued photos uploaded, advance to signature screen
- [ ] Re-opening the same appointment → existing draft loaded (form pre-filled, photos shown)
- [ ] RLS: rufero from tenant B cannot upload a photo to `inspection-photos/{tenant_A}/...`
- [ ] Camera permission denied → graceful prompt with "Open Settings" deeplink

---

## 10. Pitfalls to avoid

- **Don't** upload the original camera image. Phones produce 4–8 MB JPEGs at full resolution. Compress before upload, always.
- **Don't** wait for GPS before letting the user capture. The camera should open immediately; GPS resolves in parallel and gets attached if available.
- **Don't** require the rufero to fill the damage form before adding photos. Order is irrelevant — photos and form data are independent until Save.
- **Don't** lock the screen orientation. Roofers shoot in portrait mostly, but a damaged gutter pan is easier in landscape — let the OS handle rotation.
- **Don't** show the upload progress per-photo in the grid. Show one summary chip in the top bar (`Uploading 3 of 5…`). Per-photo progress is too busy.
- **Don't** auto-tag photos based on heuristics. Tag picking is fast and the rufero is in the best position to decide. AI auto-tagging is M-future (Tier 5).
- **Don't** save the form to Supabase on every keystroke. Save the draft locally (Hive in Stage 8) on every change; sync to Supabase only on Save & Continue.
- **Don't** crash if location permission is denied — null `gps_lat`/`lng` is perfectly fine and the schema allows it.
- **Don't** show all 13 photo tags in a single row of chips. Group: Exteriors (front/back/sides), Damage focus (overview/close-up damage/evidence), Components (gutters/chimney/skylights/HVAC/siding), Other. Saves the rufero a 2-second scan.
- **Don't** allow `Save & Continue` while a photo upload is in flight — if the network drops mid-save the inspection row exists but photos don't. Wait or queue (Stage 8 makes the queue safe).

---

## 11. What ships at end of Stage 7

- 2 migrations: `inspection_reports` columns, `photos` table + RLS
- 1 feature folder: `features/inspection/` with full DDD layers
- 2 pages: `InspectionPage`, `PhotoCapturePage`
- 3 widgets: `PhotoGrid`, `PhotoTagSelector`, `DamageForm`
- 1 utility: `PhotoProcessor` (resize, recompress, EXIF strip)
- Manifest / Info.plist permission entries
- BLoC + repository + datasource scaffolding mirroring `features/prospects/`
- Shared `photo_tags.dart` constants

Stage 8 wraps everything here in an offline queue, adds the signature pad, and stitches in the document generation + signing pipeline.
