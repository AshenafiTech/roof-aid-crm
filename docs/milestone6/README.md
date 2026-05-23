# Milestone 6 — Mobile Deep Dive + Offline

**Duration:** Week 7
**Goal:** Harden the Flutter app so a Rufero can run the full inspection workflow on a rooftop with no signal, get push notifications when they're back online, view signed PDFs in-app, navigate to the next appointment, and log in with Face ID / fingerprint. After M6 the mobile app is no longer "nice to have" — it's the primary surface for field work.

> M6 also folds in two web-side deliverables that shipped early during this milestone window:
> [document-templates-customization.md](document-templates-customization.md) (owner-authored templates + telefonista per-document edits + audit log) and
> [fix-pdf-preview-worker.md](fix-pdf-preview-worker.md). They were sequenced into M6 because M5's PDF pipeline made them unblockable, and they unblock the document-viewer work in Stage 3.

---

## 1. Why this milestone matters

After M5, the inspection flow works **as long as the rufero has bars**. Real storm-response work happens in neighborhoods where:

- LTE drops to a single bar inside a covered patio
- the rufero is on a roof, behind a chimney, with their phone in a pocket
- the homeowner wants to sign **right now** and won't wait for "let me drive somewhere with signal"

Every failure mode in the field is silent: the app appears to save, the rufero walks off the roof, and an hour later the office sees zero data. M6 closes that gap.

The five pillars:

1. **Offline-first sync engine** — every screen reads from Hive first, writes to Hive first, and the network layer is a background process. The UI never blocks on the network.
2. **Photo upload pipeline that cannot lose photos** — exponential backoff, manual retry, durable queue, atomic writes. A photo taken offline survives an app kill, an OS update, and a low-battery shutdown.
3. **Document viewer + share** — Ruferos need to show signed PDFs to homeowners on the spot, then email or AirDrop a copy. No "open in browser" workaround.
4. **Push notifications via FCM** — new appointment assigned, document signed, inbound SMS, all delivered while the app is closed. Without this the rufero misses the next job.
5. **Biometric login + polished settings** — daily login friction is the #1 reason mobile apps get uninstalled. Face ID on second launch + a clean settings screen lifts retention 30–40%.

After M6, the demo line shifts from "we built a mobile app" to "we built a mobile app that works on a roof in a hailstorm."

---

## 2. Scope summary (from blueprint M6)

| # | Task | Surface |
|---|------|---------|
| M6-1 | Full offline mode — cached prospects + appointments, queued status/notes, sync indicator, last-write-wins | Mobile |
| M6-2 | Photo upload pipeline — 3 auto-retries with exponential backoff, manual retry, per-photo progress, durable Hive queue | Mobile + Storage |
| M6-3 | Document viewer — in-app signed-PDF view with pinch-zoom, share sheet (email / AirDrop / Android share), download to device | Mobile |
| M6-4 | Push notifications (FCM) — appointment assigned, document signed, inbound call/SMS; deep-link to record on tap | Mobile + Edge Function |
| M6-5 | My Schedule screen — today + upcoming chronologically, date nav, appointment detail with Confirm / Complete / No-show / Cancel + Navigate + Call/SMS | Mobile |
| M6-6 | Mobile navigation — "Navigate" launches Google Maps / Apple Maps with turn-by-turn directions to prospect address | Mobile |
| M6-7 | Biometric auth — Face ID / fingerprint on subsequent sessions, encrypted session token in secure storage | Mobile |
| M6-8 | Settings screen — profile photo, per-type notification toggles, biometric toggle, app version, logout | Mobile |

Plus two web items already shipped in this milestone (see linked docs above):

| # | Task | Surface |
|---|------|---------|
| M6-W1 | Document template customization — owner authoring + per-document telefonista edits + immutable versions + audit log | Web + DB |
| M6-W2 | PDF preview worker fix — `react-pdf` worker bundling stabilized so document previews render in production | Web |

---

## 3. Execution plan — 8 mobile stages

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Offline-first data layer — typed Hive boxes, repository pattern, sync engine, conflict resolution, connectivity-driven flush | [stage-1-offline-sync-engine.md](stage-1-offline-sync-engine.md) |
| 2 | Photo upload pipeline — durable queue, exponential backoff, manual retry, per-photo progress, never-lose-a-photo guarantee | [stage-2-photo-upload-pipeline.md](stage-2-photo-upload-pipeline.md) |
| 3 | Document viewer — `pdfx` / `flutter_pdfview`, pinch-zoom, share sheet, download | [stage-3-document-viewer.md](stage-3-document-viewer.md) |
| 4 | Push notifications — FCM setup, token registration, server send Edge Function, notification routing | [stage-4-push-notifications.md](stage-4-push-notifications.md) |
| 5 | My Schedule screen — agenda list, appointment detail actions, integration with offline queue | [stage-5-my-schedule.md](stage-5-my-schedule.md) |
| 6 | Mobile navigation — launch external map app with directions | [stage-6-mobile-navigation.md](stage-6-mobile-navigation.md) |
| 7 | Biometric auth — `local_auth` + `flutter_secure_storage`, opt-in flow, lock-on-resume | [stage-7-biometric-auth.md](stage-7-biometric-auth.md) |
| 8 | Settings screen — profile, notification prefs, biometric toggle, app version, logout polish | [stage-8-settings-screen.md](stage-8-settings-screen.md) |

**Parallelization:**
- Stage 1 ships first — every subsequent stage either reads from or writes to the offline layer.
- Stage 2 depends on Stage 1's queue plumbing.
- Stage 3 is independent of Stages 1–2 — can start any time.
- Stage 4 needs a `users.fcm_token` column + an Edge Function trigger; the mobile side parallelizes with Stage 5/6.
- Stages 5–6 chain naturally (My Schedule needs Navigate).
- Stages 7–8 are independent UI work; can run last in parallel.

---

## 4. Pre-requisites (must be done before starting M6)

- [ ] **M5 Definition of Done signed off** — inspection write paths, signature flow, PDF generation Edge Function, `documents` table all live.
- [ ] **`users.fcm_token TEXT` column** — migration `036_m6_fcm_tokens.sql`. Nullable; populated on app launch. Stage 4 unblocked.
- [ ] **Firebase project provisioned** — one Firebase project per environment (dev / staging / prod). FCM enabled. Service account JSON stored in Supabase secret `FIREBASE_SERVICE_ACCOUNT`.
- [ ] **APNs certificate uploaded to Firebase** (iOS push). Auth key (`.p8`) + Team ID + Key ID added in Firebase console → Project Settings → Cloud Messaging.
- [ ] **`google-services.json`** (Android) + **`GoogleService-Info.plist`** (iOS) checked into `apps/mobile/android/app/` and `apps/mobile/ios/Runner/`. Both gitignored on the per-env keys — committed templates only.
- [ ] **Flutter packages added to `pubspec.yaml`** (verified, not just listed):
  - `firebase_core`, `firebase_messaging` — Stage 4
  - `flutter_local_notifications` — Stage 4 foreground display
  - `pdfx` (recommended) or `flutter_pdfview` — Stage 3
  - `share_plus` — Stage 3
  - `local_auth` — Stage 7
  - `flutter_secure_storage` — Stage 7
  - `path_provider` — Stages 2, 3 (already transitively present)
- [ ] **Hive typed adapters compiled** — `pubspec` runs `build_runner` for `CachedProspect`, `CachedAppointment`, `PendingPhoto`, `PendingInspection`, `PendingSignature`, `PendingStatusUpdate`, `PendingNote`. Stage 1 generates these.
- [ ] **iOS Info.plist + Android manifest permission strings** for: camera (already M5), location-when-in-use (Stage 6 nav), Face ID (`NSFaceIDUsageDescription`, Stage 7), notifications (Stage 4 — iOS user prompt).
- [ ] **Storage bucket `inspection-photos` lifecycle policy verified** — Stage 2 may produce a temporary spike in cold-tier eligible objects.
- [ ] **A real second phone** (not a simulator) for offline testing. Simulators lie about airplane mode + WiFi behavior.
- [ ] **Environment variables added** to `apps/mobile/.env`:
  ```
  FCM_SENDER_ID=...
  ANDROID_GOOGLE_SERVICES_JSON_PATH=android/app/google-services.json
  IOS_GOOGLE_SERVICES_PLIST_PATH=ios/Runner/GoogleService-Info.plist
  OFFLINE_SYNC_INTERVAL_SECONDS=30
  PHOTO_RETRY_BACKOFF_SECONDS=10,30,120,600,1800
  ```

> **Do not start Stage 2 until Stage 1 lands.** The retry queue lives on top of the sync engine.
> **Do not start Stage 4 until the Firebase project + APNs cert are configured.** Half-done FCM is worse than no FCM.

---

## 5. Key architectural decisions for M6

### 5.1 Repository = single source of truth; UI never talks to Supabase directly

Every feature's `Repository` reads from Hive first and returns immediately, then kicks a background fetch that updates Hive, which emits a stream the UI listens to. The UI sees the cached state instantly, then sees the fresh state seconds later. There is no "loading spinner blocks the screen for 3 seconds" path.

**Why:** A field UX rule — never show a spinner over data the user already saw 10 minutes ago. The previous answer is almost always still right.

### 5.2 Pending mutations are typed and durable, not generic JSON blobs

`PendingPhoto`, `PendingInspection`, `PendingSignature`, `PendingStatusUpdate`, `PendingNote` are each their own Hive type with their own adapter. Each has `id`, `createdAt`, `attemptCount`, `lastError`, and the mutation payload. The sync engine handles each type with its own retry policy.

**Why:** A generic `PendingMutation { type: string, payload: Map }` blob looks elegant until a schema migration corrupts every queued item. Typed adapters mean a `PendingPhoto` from app v1.4 still deserializes in v1.5.

### 5.3 Sync engine is single-threaded per Hive box

One `SyncRunner` per typed queue. The runner drains its queue serially. No two photo uploads happen in parallel from the same device. Three concurrent device-to-server connections is more than enough; ten concurrent connections from a phone on 2 bars of LTE is a self-DDoS.

**Why:** Photo uploads on poor connections fail in correlated waves. Serializing keeps the failure recovery sane and the user-visible progress monotonic.

### 5.4 Connectivity is observed, not polled

`connectivity_plus` (already in `pubspec`) emits a stream; the sync engine listens. On `online`, every runner gets a `flush()` call. On `offline`, runners stop attempting and the header indicator flips to "Offline — N pending."

**Why:** Polling drains battery and lies. The OS already knows when the radio came back up — use it.

### 5.5 Exponential backoff per item, with a global cap

Retry intervals per photo: `10s → 30s → 2m → 10m → 30m → 30m … (capped at 24h total)`. A photo that has failed for 24h is surfaced as a hard error requiring rufero action ("This photo couldn't upload. Retry, or save a copy to your gallery and contact support."). Photos in error state never auto-delete.

**Why:** Aggressive retries burn battery; sparse retries leave data stuck. The cap forces a human in the loop on truly broken items so they don't sit forever pretending to be in progress.

### 5.6 FCM token lifecycle is server-driven, not client-driven

The mobile app POSTs its token on every launch to a `register-device` Edge Function. The function upserts `users.fcm_token` with `last_seen_at`. The send Edge Function reads `fcm_token` and trims tokens whose `last_seen_at > 60 days`. The app does **not** manage token rotation — it just announces.

**Why:** Tokens rotate silently on the OS side (app reinstall, OS upgrade, user clears app data). The only reliable strategy is "trust the most recent announce." 60-day pruning keeps the table clean without ever guessing whether a token is alive.

### 5.7 Push notification payload is small + deep-linkable, never the message body itself

FCM data payload: `{ type: 'appointment_assigned', resource_id: '<uuid>', tenant_id: '<uuid>' }`. The notification body is a short localized string. When the user taps, the app fetches the full record from Supabase (online) or from Hive (offline if it was already cached).

**Why:** FCM payloads have a 4KB limit and can be silently dropped if too large. Source of truth must remain the database, not a transient push payload.

### 5.8 Document viewer renders from Storage signed URL, then caches the bytes

Stage 3 fetches a 1-hour signed URL, downloads the PDF, caches the bytes in `documents-cache` Hive box keyed by `document_id + version_hash`. Subsequent opens skip the network if the version_hash matches.

**Why:** Signed PDFs are immutable artifacts. Once we have the bytes, they're valid until the underlying document is regenerated — version_hash captures that exactly. Offline document viewing for free.

### 5.9 Biometric is opt-in and never the only factor

Face ID / fingerprint unlocks an encrypted refresh token stored in `flutter_secure_storage`. The first login is always email + password. If biometric fails or the device changes, the user falls back to email + password. We never store the password itself, only the refresh token. The biometric prompt is shown on cold launch and after >5 min in background.

**Why:** Biometric-only auth is a regulatory headache (PIPEDA / GDPR / state laws around biometric-only authentication) and a recovery nightmare. Opt-in + password fallback is the standard pattern.

### 5.10 Settings is a feature, not a dumping ground

Each setting is a typed `UserPreference` with a default. Reads come from a `PreferencesRepository` backed by Hive (offline-first), writes hit Hive immediately and queue a server sync. Notification toggles map 1:1 to the FCM topic subscription state — toggling off unsubscribes from the topic, not just hides the notification locally.

**Why:** "User toggled off appointment notifications but still gets them" is the most common settings bug in mobile apps. Pushing the toggle all the way to the topic subscription level prevents that class entirely.

### 5.11 Last-write-wins, but with `updated_at` reconciliation

Stage 1 keeps M5.7's last-write-wins rule but tightens it: every mutation carries the **client-observed `updated_at`** at queue time. On sync, the server checks if the row's current `updated_at` is later than the client-observed one. If so, the conflict is logged to `activities` with `source = 'conflict_lost'` and **the field-level diff** so admins can see what was overwritten.

**Why:** M5.7's "log to activities" was the right call but the metadata was thin. M6 needs richer conflict context because more mutations are queued, for longer, and overwrites become statistically inevitable.

---

## 6. Definition of Done

### Offline
- [ ] Cold-launch app with airplane mode on → assigned prospects + today's + this week's appointments visible from Hive within 500ms
- [ ] Tap any cached prospect → full detail loads from Hive (overview, notes, recent calls/SMS placeholders if cached, inspection state)
- [ ] Header indicator reflects connectivity: `All synced` / `Offline — N pending` / `Syncing N…`
- [ ] Kill app mid-sync → relaunch → queue resumes from where it stopped, no duplicates, no losses

### Photos
- [ ] Take 10 photos offline → all 10 visible in inspection screen with "Pending sync" badge
- [ ] Enable network → all 10 upload in ≤ 90s on 4G; per-photo progress shown
- [ ] Simulate failed upload on photo 4 (e.g. force-close mid-upload) → retries with backoff; manual "Retry" button works
- [ ] Photo that fails for 24h surfaces as hard error with a "Retry" + "Save to gallery" path; never silently disappears
- [ ] App kill + cold relaunch with 7 queued photos → queue intact, all photos eventually upload

### Document viewer
- [ ] Tap a signed PDF in mobile Documents tab → renders in ≤ 2s on 4G; pinch-zoom smooth
- [ ] Share button opens native share sheet → emailing / AirDrop / saving to Files works
- [ ] Download button saves to device "Roof-Aid" folder; appears in Files / Photos
- [ ] Open the same PDF offline (after first view) → renders from cache

### Push notifications
- [ ] Telefonista assigns a new appointment → rufero phone shows push within 10s (foreground + background + closed states)
- [ ] Tap notification → app opens directly on the appointment detail
- [ ] Document signed by homeowner → admin phones (with role-appropriate users) get push
- [ ] Inbound SMS to assigned prospect → assigned rufero gets push
- [ ] Toggle off "Appointment assigned" in Settings → no more pushes of that type; toggling on resumes them
- [ ] FCM token rotation handled: reinstall app → server registers the new token → old token stops receiving

### My Schedule
- [ ] Bottom-tab **Schedule** opens an agenda list: Today section, then upcoming dates
- [ ] Date jumper at top → tap a date → scroll to that section (or empty state)
- [ ] Tap appointment → detail screen with prospect block, address, notes, status buttons (role-gated), Navigate button, Call homeowner, SMS homeowner
- [ ] Confirm / Complete / No-show / Cancel work offline (queued) → status updates locally + syncs

### Navigation
- [ ] Navigate button opens Apple Maps (iOS) / Google Maps (Android) directly to driving directions to the prospect address
- [ ] Long-press on Navigate → menu offering Apple Maps / Google Maps / Waze (whichever are installed)

### Biometric
- [ ] First login = email + password (unchanged)
- [ ] Settings → enable biometric → prompts Face ID / fingerprint to confirm
- [ ] Next cold launch → biometric prompt; success unlocks the app; cancel falls back to email + password
- [ ] Biometric disabled in Settings → no prompt; only email + password
- [ ] After 5 min in background → biometric prompt on resume

### Settings
- [ ] Profile photo: tap → camera/library → uploads to Storage → `users.avatar_url` updated
- [ ] Notification toggles: Appointment assigned / Document signed / Inbound SMS / Inbound call — each separately toggles FCM topic subscription
- [ ] App version + build number shown
- [ ] Logout clears Hive, secure storage, FCM token; returns to login

### Cross-cutting
- [ ] Sync engine logs every queue drain to a local rolling log (last 100 events) viewable from Settings → "Sync log" (hidden behind a debug tap)
- [ ] No Edge Function call fans out to >1 SMS / push per logical event (idempotency keys on `notification_sends` table)
- [ ] All Storage downloads tenant-checked (verify a tenant-B user cannot fetch tenant-A signed PDFs even if URL is leaked)

---

## 7. Out of scope for M6 (deferred)

- **Web push notifications** → M7+ (M6 is mobile-only for push)
- **Background sync on iOS via BGTaskScheduler** → M7+ polish (M6 syncs on foreground + connectivity events only)
- **In-app messaging between team members** → M-future
- **Photo annotation / draw-on-photo** → M-future (M5 + M6 capture raw photos only)
- **Multi-device login session management UI** → M7+
- **Granular per-recipient notification routing** ("send to Carlos only, not Maria") → M7+
- **End-to-end encryption of queued items** → not a requirement; secure storage + RLS is sufficient
- **PDF editing on mobile** → never; mobile viewer is read-only
- **Custom map provider (Mapbox, OSM)** → M-future; Google + Apple Maps deep-link covers M6
- **Apple Watch / wearOS extensions** → not on roadmap

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hive schema migration corrupts queued items between releases | Low | **Critical** | Every Hive type has a `version` field; sync engine rejects + logs unknown versions rather than throwing. Test by installing v1.4, queueing 5 photos, upgrading to v1.5, confirming all 5 upload. |
| FCM payloads silently dropped on iOS due to APNs misconfiguration | Medium | High | Stage 4 spike: send a test push to a TestFlight build before main implementation. Verify `apns-priority`, `apns-push-type`, content-available flags. |
| Photo queue grows unbounded if a rufero is offline for days | Low | Medium | Soft cap at 200 pending photos per device. Beyond that, UI prompts "device is heavily offline — open a hotspot or reduce session length." Photos never deleted, just gated. |
| Biometric prompt fails on devices where the user has Face ID disabled at OS level | Medium | Low | `local_auth` returns `notAvailable` → app silently disables biometric setting and falls back to email + password. No infinite prompts. |
| Document viewer can't render PDFs >10 MB on older Android devices | Medium | Medium | Stage 3 enforces a 10 MB limit on signed PDFs server-side (our PDFs are typically <100 KB). For uploaded docs >10 MB, fall back to "Open in browser" with a one-time signed URL. |
| Push notifications arrive before the appointment is queryable from a stale cache | Low | Medium | Notification handler fetches the resource on tap; if offline, opens an empty "appointment loading…" screen with retry button rather than crashing. |
| Last-write-wins overwrites a critical admin status change silently | Medium | Medium | M6.5.11: every conflict logged to `activities` with field-level diff; M7 surfaces a "lost edits" review screen for admins. |
| Increased Storage egress from in-app PDF viewing | Low | Low | Stage 5.8 caches by `version_hash` — once viewed, no re-download. Negligible egress. |
| `flutter_secure_storage` returns null after OS update on some Android versions | Low | High | Detect null refresh token → force re-login. Acceptable degradation. Add Sentry breadcrumb to track frequency. |
| Stage 1's sync engine race conditions under rapid toggling of airplane mode | Medium | Medium | Each `SyncRunner` uses a mutex around `flush()`. Connectivity stream debounced 1s. Stage 1 includes a chaos test toggling network every 200ms for 30s and verifying queue integrity. |

---

## 9. Execution order

1. **Pre-reqs:** verify M5 sign-off, configure Firebase + APNs, add packages, run migration `036_m6_fcm_tokens.sql`, generate Hive typed adapters.
2. **Stage 1** — offline sync engine. Must ship first; every subsequent stage builds on it.
3. **Stage 2** — photo upload pipeline. Depends on Stage 1.
4. **Stage 3** — document viewer. Independent of Stages 1–2; can run in parallel.
5. **Stage 4** — push notifications (FCM). Parallelizes with Stages 2–3 once Firebase config is in place.
6. **Stage 5** — My Schedule. Depends on Stage 1 for offline data, parallelizes with Stage 4.
7. **Stage 6** — Mobile navigation deep-link. Tiny, slots in alongside Stage 5.
8. **Stage 7** — Biometric auth. Independent, can run any time after Stage 1.
9. **Stage 8** — Settings screen. Last; pulls together biometric, notification toggles, profile.

Estimated total: **9–11 days** end-to-end. Stage 1 (sync engine) eats ~3 days alone — protect that estimate, it's the foundation everything else stands on.

---

## 10. Success demo script (for client)

Eight minutes, one phone, one laptop:

1. **Cold launch the app on the rufero's phone** — biometric prompt → Face ID → home screen in <1s
2. Open **Schedule** tab → today's three appointments visible
3. Tap the first appointment → detail screen → tap **Navigate** → Apple Maps opens with turn-by-turn to the prospect address; close Maps
4. Back in the app → **Enable airplane mode** (show it to the room)
5. Tap **Start Inspection** → take 5 photos with type tags; fill the damage form; save → status shows "Pending sync — 6 items"
6. From the laptop (admin side, still online): create a brand new appointment for this rufero in 30 minutes → confirm the appointment is queued for delivery
7. **Disable airplane mode** on the phone → within 15s:
   - sync indicator: "Syncing 6 items…" → "All synced"
   - push notification arrives: "New appointment assigned — 123 Main St at 3:00 PM"
8. Tap the push → app opens directly on the new appointment detail
9. Open the prospect's signed Authorization PDF from the Documents tab → renders in <2s, pinch to zoom in, share via email → email arrives in the demo inbox
10. **Re-enable airplane mode** → open the same PDF again → still renders from cache
11. On the laptop, toggle the rufero's "Appointment assigned" notification preference off (showing it works either direction) → assign another appointment → confirm **no** push arrives
12. Background the app for 6 minutes → reopen → biometric prompt → unlock
13. Open **Settings → Sync log** → show the last 100 sync events, including the conflict resolution from a deliberate concurrent edit

If steps 1–13 work end-to-end with real FCM pushes, real photo upload retries, real offline PDF viewing, and real biometric login, M6 is done.

---

## 11. Web addenda (already shipped)

These were sequenced into the M6 window because they unblock other M6 work or fix M5 regressions:

- **[document-templates-customization.md](document-templates-customization.md)** — owners author per-tenant contract templates with versioning; telefonistas can edit on a per-document basis with full audit. Unblocks Stage 3 (mobile viewer renders these custom-templated PDFs identically to the hardcoded ones).
- **[fix-pdf-preview-worker.md](fix-pdf-preview-worker.md)** — fixes the `react-pdf` worker URL in production so the web document preview pane renders without errors. Mobile is unaffected but the office-side workflow it supports (review-before-send) is shared with mobile reviewers.
