# Stage 3 — Mobile Document Viewer

**Depends on:** M5 Stages 4–6 (PDF generation + e-signature). Independent of Stages 1–2 but uses Stage 1's caching pattern.
**Blocks:** nothing.
**Estimated:** 1 day.

## Purpose

Let a rufero open any signed or unsigned PDF in-app, zoom in to show the homeowner specific clauses, and share the file by email or AirDrop without leaving the app or routing through a browser.

## Scope

### 3.1 PDF renderer

Use `pdfx` (recommended — actively maintained, supports both iOS and Android, vector rendering). Fallback: `flutter_pdfview`.

- Single page + multi-page view.
- Pinch-zoom up to 4×, pan, double-tap to fit.
- Page indicator at bottom ("Page 2 of 4").
- Loading state with progress bar (download phase) → render phase.

### 3.2 Fetch + cache

```dart
Future<Uint8List> fetchPdf(Document doc) async {
  final hash = doc.versionHash;
  final cached = _cacheBox.get(doc.id);
  if (cached != null && cached.hash == hash) return cached.bytes;

  final signedUrl = await _supabase.storage
    .from('documents')
    .createSignedUrl(doc.storagePath, 3600);
  final bytes = await _http.get(signedUrl);
  await _cacheBox.put(doc.id, CachedPdf(hash: hash, bytes: bytes, fetchedAt: DateTime.now()));
  return bytes;
}
```

- `documents-cache` Hive box keyed by `document.id`, value = `{ hash, bytes, fetchedAt }`.
- LRU eviction at 100 MB total cache size.
- `version_hash` server-side = SHA-256 of the PDF bytes; added to `documents.version_hash` column in migration `038_m6_document_version_hash.sql` (populated by the existing `generate-pdf` Edge Function on write).

### 3.3 Share

`share_plus` package:
- **Share** button → opens native share sheet with the PDF attached (`Share.shareXFiles([XFile(tempPath)])`).
- **Download** button → saves to platform standard location:
  - iOS: writes to app's `Documents/Roof-Aid/` (visible in Files app)
  - Android: writes via `path_provider`'s `getExternalStorageDirectory()` → `Roof-Aid/`, registered with MediaScanner so it appears in Files
- Filename: `{prospectName}-{docKind}-{YYYY-MM-DD}.pdf`, sanitized.

### 3.4 Document detail screen

Replaces the M5 stub in `apps/mobile/lib/features/documents/presentation/pages/document_detail_page.dart`:

- Header: doc kind, status pill, created date
- Inline PDF viewer (full width, ~70% screen height)
- Bottom action bar: **Share**, **Download**, **Sign** (if unsigned), back

If the doc is unsigned and the rufero has signing permission → tapping **Sign** opens the M5 signature pad flow.

### 3.5 Offline behavior

- If cached + offline → renders immediately
- If not cached + offline → "This document needs an internet connection to download. It will be available offline after the first view."
- Pre-fetch: when an appointment is cached for offline, all of its prospect's documents are queued for opportunistic pre-fetch on next online window (low priority, runs after Stage 1's mutation queue is empty).

### 3.6 Server-side size guard

Edge Function `generate-pdf` already produces ~50 KB files. Add a hard 10 MB ceiling in the upload path so a future template can't accidentally produce a phone-killer doc.

## Verification

1. Open a signed PDF on the rufero phone → renders in ≤ 2s on 4G
2. Pinch-zoom + pan smooth at 60 fps
3. Share → email opens with the PDF attached
4. Download → file appears in iOS Files / Android Files under "Roof-Aid"
5. Open the same PDF again → renders instantly (cache hit)
6. Enable airplane mode → open the same PDF → renders from cache
7. Airplane mode + a previously-unseen PDF → friendly "needs internet" message, no crash
8. Cache exceeds 100 MB → oldest documents evicted; recently-viewed remain
9. Server `version_hash` changes (e.g., template re-rendered) → next open downloads fresh bytes, cache replaced

## Files

### Created
- `apps/mobile/lib/features/documents/data/pdf_cache_store.dart`
- `apps/mobile/lib/features/documents/data/models/cached_pdf.dart` (Hive `typeId: 13`)
- `apps/mobile/lib/features/documents/presentation/widgets/pdf_viewer.dart`
- `apps/mobile/lib/features/documents/presentation/widgets/document_action_bar.dart`
- `supabase/migrations/038_m6_document_version_hash.sql`

### Modified
- `apps/mobile/lib/features/documents/presentation/pages/document_detail_page.dart`
- `apps/mobile/lib/features/documents/data/repositories/documents_repository.dart`
- `supabase/functions/generate-pdf/index.ts` — write `version_hash` on output
- `supabase/functions/embed-signature/index.ts` — write `version_hash` for signed copy
- `apps/mobile/pubspec.yaml` — add `pdfx`, `share_plus`

## Out of scope
- PDF editing → never
- Annotation / highlighting on the PDF → M-future
- DRM / watermarking with the viewer's identity → M8 security pass
