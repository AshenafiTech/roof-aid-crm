# Milestone 5 — Appointments + Documents & E-Signature

**Duration:** Week 6
**Goal:** Close the loop from "interested prospect" to "signed contract." Ship the appointment scheduler with rufero availability + auto-suggestion, multi-view calendar, SMS reminder cron, PDF generation (3rd Party Authorization, ACV, RCV), web e-signature flow, and a full mobile inspection screen with offline photo/form/signature capture.

---

## 1. Why this milestone matters

M4 made Roof-Aid a *communication* tool. M5 makes it a *closing* tool.

Every roofing deal lives or dies on three things after the first call:
1. Did we get a roof inspection on the calendar before the homeowner cooled off?
2. Did the rufero show up, document the damage, and capture a signature on the 3rd Party Authorization while standing on the lawn?
3. Did a signed contract land in the homeowner's inbox before they called a competitor?

M5 owns all three. After M5 the demo becomes: "Telefonista books → rufero gets notified → drives to the house → photographs the damage → homeowner signs on the rufero's tablet → contract emails itself → done." That is the product Roof-Aid is actually selling.

Everything in M5 also has to survive **no signal on a rooftop** — which is why offline isn't a stretch goal, it's the acceptance bar for M5-9 through M5-12.

---

## 2. Scope summary (from blueprint M5)

| # | Task | Surface |
|---|------|---------|
| M5-1 | Appointment scheduler — date/time picker, rufero assignment, 2h overlap buffer, distance-based auto-suggest from `home_base_coords` | Web |
| M5-2 | Calendar views — month / week / day, filter by rufero, color-coded by status | Web |
| M5-3 | Appointment status management — confirm/cancel (with reason), complete/no-show, reschedule creates new row with `rescheduled_from` FK, notifications on every transition | Web + Mobile |
| M5-4 | Appointment reminders Edge Function — pg_cron every 60 min, SMS at T-24h and T-2h via the M4 `send_sms` RPC | Edge Function |
| M5-5 | PDF generation Edge Function — `generate-pdf` using `pdf-lib`, three templates (3rd Party Auth, ACV, RCV), orange header (`#E8501F`), homeowner block, signature line | Edge Function |
| M5-6 | Document generation workflow — New Document modal → cloud function → `documents/{tenant_id}/{prospect_id}/{doc_id}.pdf` → `documents` row | Web + Storage |
| M5-7 | Web e-signature — PDF preview + signature pad → PNG to Edge Function → embed into PDF → signed version saved separately → emailed to homeowner via M4 email | Web + Edge Function |
| M5-8 | Documents page — list grouped by prospect, upload, signed-URL download (1h expiry), admin-only delete | Web |
| M5-9 | Mobile inspection screen — camera + 13 photo tags, auto-metadata (prospect, inspection, GPS, timestamp), 2MB compression, upload to `inspection-photos/{tenant_id}/{inspection_id}/...` | Mobile |
| M5-10 | Mobile damage form — roof age, material, storm date, affected areas, severity, notes → `inspection_reports` | Mobile |
| M5-11 | Mobile signature capture — full-screen pad, homeowner name + date, PNG to Edge Function | Mobile |
| M5-12 | Mobile offline inspection — photos / status / notes / signature queued in local store, synced on reconnect with conflict resolution, sync indicator in app chrome | Mobile |

---

## 3. Execution plan — 6 stages

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Schema + RPC foundation: `appointments` columns, `rescheduled_from` FK, `documents` table, `inspection_reports`, `suggest_rufero()` RPC, `check_appointment_conflict()` RPC | [stage-1-appointments-foundation.md](stage-1-appointments-foundation.md) |
| 2 | Web appointment scheduler + calendar views — modal, month/week/day views, status transitions | [stage-2-web-scheduler.md](stage-2-web-scheduler.md) |
| 3 | Appointment reminders cron + SMS — pg_cron job, idempotency on `reminder_sent_24h` / `reminder_sent_2h` flags | [stage-3-reminders.md](stage-3-reminders.md) |
| 4 | PDF generation + Documents page — `generate-pdf` Edge Function, three templates, list/upload/download UI | [stage-4-pdf-documents.md](stage-4-pdf-documents.md) |
| 5 | Web e-signature flow — PDF preview, signature pad, embed-and-store pipeline, auto-email to homeowner | [stage-5-web-esign.md](stage-5-web-esign.md) |
| 6 | Mobile inspection — photos + form + signature + offline queue with reconnect sync | [stage-6-mobile-inspection.md](stage-6-mobile-inspection.md) |

Stages 1 → 2 → 3 are a vertical slice (book → remind). Stage 4 → 5 is the document slice (generate → sign). Stage 6 is the mobile slice and can start once Stage 4 ships the `generate-pdf` contract (mobile signature reuses the same embed endpoint).

---

## 4. Pre-requisites (must be done before starting M5)

- [ ] **M4 Definition of Done signed off** — specifically: `send_sms` RPC works (M5-4 reuses it), email send via M4 works (M5-7 reuses it), notifications table populated (status changes write here)
- [ ] **Storage bucket `documents`** created, private, RLS policy mirrors `inspection-photos`: path prefix `{tenant_id}/...`, no cross-tenant reads
- [ ] **Storage bucket `signatures`** (private) — staging area for signature PNGs before they're embedded; lifecycle policy deletes objects > 24h old
- [ ] **`pdf-lib`** added to the Edge Function deno import map; pinned version
- [ ] **`pg_cron`** extension enabled on Supabase (Settings → Database → Extensions). Required for M5-4 reminders
- [ ] **`users.home_base_coords`** populated for every rufero (M3 should have this; verify with `SELECT count(*) FROM users WHERE role = 'rufero' AND home_base_coords IS NULL`). M5-1 auto-suggest needs it
- [ ] **Tenant branding fields** — `tenants.company_name`, `tenants.brand_primary_color` populated. PDF header pulls from these (default `#E8501F` if null)
- [ ] **Mobile push notifications working from M4** — M5-3 status changes deep-link from a push into the appointment detail
- [ ] **Tables verified present:** `appointments`, `documents`, `inspection_reports`. Any missing columns land as migrations in Stage 1
- [ ] **Demo data** — at least 2 ruferos with non-overlapping home base coords, 3 unscheduled prospects within driving distance of each, for the calendar/auto-suggest demo

---

## 5. Key architectural decisions for M5

### 5.1 Appointment conflict + auto-suggest live in SQL, not JS

`check_appointment_conflict(rufero_id, start_at, end_at)` and `suggest_rufero(prospect_id, start_at, end_at)` are RPCs. The conflict check uses an `EXCLUDE USING gist (rufero_id WITH =, tstzrange(start_at - interval '2 hours', end_at + interval '2 hours') WITH &&)` constraint on `appointments` — the database refuses to insert a conflicting row even if a buggy UI sends one.

**Why:** Double-booking a rufero is the kind of bug a frustrated customer notices on day 3. A DB-level exclusion constraint is one line of SQL and is impossible to forget.

### 5.2 Reminders run on pg_cron, idempotency lives in the row

`pg_cron` job every 60 minutes selects appointments where:
- `start_at` is between `now() + 23h` and `now() + 24h` AND `reminder_24h_sent_at IS NULL` → send 24h SMS, set flag
- `start_at` is between `now() + 1h` and `now() + 2h` AND `reminder_2h_sent_at IS NULL` → send 2h SMS, set flag

The flag is set in the same transaction as the SMS insert, so a crashed cron run doesn't double-send.

**Why:** The "I got the same reminder 6 times" complaint is the fastest path to a homeowner blocking the tenant's number — and Telnyx flagging the messaging profile. Idempotency on the row, not the cron, is the only safe pattern.

### 5.3 PDF generation is an Edge Function, not a client-side render

`pdf-lib` runs in Deno on the Edge Function. The client never sees the raw PDF bytes during generation — only a signed-URL download. Templates are TypeScript modules (`templates/third-party-auth.ts`, etc.) that take a `{tenant, prospect, signer}` payload and emit a `Uint8Array`.

**Why:** Client-side PDF generation leaks tenant branding logic, makes legal review harder (which version of the contract did the homeowner sign?), and breaks on Safari iOS. Server-side is auditable: every generation writes a `documents` row with the template version baked in.

### 5.4 Signed PDF is a *separate file*, not an overwrite

`documents.unsigned_url` and `documents.signed_url` are two columns. Signing reads the original, embeds the signature PNG, and writes `{doc_id}_signed.pdf` alongside the original. The unsigned version is preserved forever.

**Why:** Legal disputes turn on "what did the homeowner actually see when they signed?" Keeping both versions is the only defensible answer.

### 5.5 Signature PNG goes to a staging bucket, not directly into the PDF

Mobile + web upload the signature PNG to `signatures/{tenant_id}/{doc_id}/{nonce}.png` first, then call `embed-signature` Edge Function with the storage path. The function fetches the PNG, embeds it, writes the signed PDF, and the staging PNG is auto-deleted by lifecycle policy 24h later.

**Why:** Decoupling lets the mobile offline queue work: the device uploads the PNG when reconnected, then triggers the embed RPC. If we tried to POST PNG-bytes directly to embed, offline retries would have to re-send the PNG on every retry — slow and lossy.

### 5.6 Mobile offline queue is one table, not per-feature stores

Flutter side: a single `pending_ops` SQLite table with `{id, kind, payload_json, attempts, last_error, created_at}`. Kinds: `inspection_photo`, `damage_form`, `signature`, `status_change`. On reconnect a single sync worker drains the queue oldest-first; failures bump `attempts` and reschedule.

**Why:** Per-feature queues sound clean but lead to four reconciliation bugs instead of one. A single queue with typed payloads is easier to test, easier to inspect from the device, and easier to migrate when M6 expands the offline surface.

### 5.7 Conflict resolution for offline sync = last-writer-wins on the *device clock*, server stamps too

When a queued op finally reaches the server, the server records both `client_timestamp` (when the rufero did the action) and `server_received_at`. UI sorts by `client_timestamp`. If two devices touch the same row offline, the later client_timestamp wins. Photos are append-only so they never conflict.

**Why:** For the M5 surface (photos + form + signature on a single inspection a single rufero is doing) genuine conflicts are vanishingly rare; the simple rule is correct ~100% of the time and is explainable to support. We revisit if multi-rufero co-inspections show up.

### 5.8 Auto-suggest "closest rufero" uses PostGIS, not Haversine in JS

`suggest_rufero()` runs a `ST_Distance(home_base_coords::geography, prospect_coords::geography)` join, filters out ruferos with conflicts in the window, returns top 3 sorted by distance.

**Why:** M3 already added PostGIS for proximity search. Reusing it keeps the math in one place and means we get correct great-circle distance instead of flat-earth approximations.

### 5.9 Photo compression happens on the device, before queue insert

`flutter_image_compress` to ≤2MB before the photo enters `pending_ops`. The queue stores the compressed bytes (or the device file path with a copy-on-insert). This protects offline storage budget — a rufero with no signal for an hour could shoot 80 photos.

**Why:** Compressing on upload means the offline queue swells with raw 12MP images and the rufero runs out of phone storage on a long no-signal job. Compress at capture time, store small.

### 5.10 PDF templates carry a `template_version` field, written into the document row

`documents.template_version TEXT NOT NULL` — e.g. `"3rd-party-auth-v1.2"`. Bumped on every contract text change. The PDF footer prints it too.

**Why:** Legal will edit the contract text. We need to be able to answer "show me the exact wording of every ACV contract signed in March" without diffing storage blobs. Versioning the template is one column for a permanent audit trail.

---

## 6. Definition of Done

### Web — Appointments
- [ ] Click **Appt** on a prospect → modal opens with date/time picker, rufero dropdown (with auto-suggested top 3 pre-sorted by distance), notes field
- [ ] Attempting to save a conflicting time slot (within the 2h buffer) shows a blocking error sourced from the DB constraint
- [ ] On save → prospect status flips to "Scheduled" → row in `appointments` → notification fires to assigned rufero
- [ ] Calendar page: month view, week view (hour grid), day view all render with color-coded status
- [ ] Filter dropdown: "All ruferos" + per-rufero option works in every view
- [ ] Status transitions: telefonista can Confirm / Cancel (with required reason), rufero can Complete / No-show, anyone can Reschedule (creates a new row with `rescheduled_from` set)
- [ ] Every status change writes to `notifications` and shows in the M4 bell

### Reminders
- [ ] pg_cron job visible in `cron.job` table, runs every 60 min
- [ ] An appointment scheduled 23h59m out gets exactly one 24h reminder SMS within an hour
- [ ] An appointment scheduled 1h59m out gets exactly one 2h reminder SMS
- [ ] Manually running the cron three times in a row does **not** send duplicates (idempotency proven)
- [ ] Reminder SMS respects the M4 DNC + calling-hours `can_message()` RPC — cancelled if prospect is DNC

### Documents
- [ ] From prospect → **New Document** → select template (3rd Party Auth / ACV / RCV) → generates within 5s → row appears in Documents tab as `generated`
- [ ] Generated PDF has the tenant's brand color header, company name, full homeowner block, body text, signature line, "Electronically signed via Roof-Aid CRM" footer, and `template_version` printed
- [ ] Documents page lists docs grouped by prospect with type / status / created_at columns
- [ ] Download uses a 1h signed URL; URLs from 2h ago fail
- [ ] Admin-only delete with a confirm dialog; non-admins don't see the delete control
- [ ] Cross-tenant download attempt (manually crafted URL) → 403

### E-signature (web)
- [ ] Open an unsigned document → scrollable PDF preview + signature pad below
- [ ] Sign → Confirm → spinner → status flips to `signed`, signed PDF appears in storage at `{doc_id}_signed.pdf`, **unsigned version is still present**
- [ ] Admin gets a notification; homeowner gets an email with the signed PDF attached
- [ ] Re-opening the document shows the signed version, with the original still downloadable for admins

### Mobile — Inspection
- [ ] Open an assigned appointment → **Start Inspection** → camera screen
- [ ] Each photo prompts for tag selection from the 13 tags, auto-attaches GPS + timestamp + prospect/inspection IDs
- [ ] Photos compress to ≤2MB before upload; verify by inspecting bucket
- [ ] Damage form: roof age / material / storm date / affected areas / severity / notes saves to `inspection_reports`
- [ ] Signature pad full screen, homeowner name + today's date shown, Clear/Confirm work
- [ ] Signed inspection routes through the same `embed-signature` Edge Function as web

### Mobile — Offline
- [ ] Airplane mode on → take 10 photos, fill damage form, capture signature → all queued (visible in `pending_ops`)
- [ ] Sync indicator in app chrome shows pending count
- [ ] Airplane mode off → queue drains within 60s; sync indicator clears
- [ ] Kill app mid-sync → reopen → remaining ops drain on reconnect (no dupes — assertion: number of rows in `inspection_photos` equals number of unique photo IDs queued)
- [ ] Conflict scenario: rufero A and rufero B both edit the same inspection notes offline → later `client_timestamp` wins on sync, earlier one shows a "your changes were overwritten" toast on next sync

### Cross-cutting
- [ ] Every signed PDF carries the template_version used to generate it
- [ ] `documents` bucket and `signatures` bucket both have RLS verified by a cross-tenant access test
- [ ] Old signatures in `signatures/` bucket auto-purge after 24h (lifecycle policy verified)

---

## 7. Out of scope for M5 (deferred)

- **Recurring appointments / availability windows per rufero** → M7 admin
- **Calendar drag-to-reschedule** → M6 or M7 polish
- **Custom PDF templates per tenant** → M7 (M5 ships the 3 fixed templates)
- **Multi-signer contracts** (homeowner + spouse) → M-future
- **PDF redlining / annotation** → never (legal requires immutable signed docs)
- **Mobile photo editing / markup** → M6 if time
- **Bulk document operations** (regenerate all, mass-send) → M7
- **Document expiration / re-signing flows** → M-future
- **Inspection report PDF export** → M7 (M5 saves to DB; PDF is contracts-only)

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `pdf-lib` Deno compatibility breaks on a Supabase Edge Function runtime upgrade | Medium | High | Pin Deno + pdf-lib versions in import map; smoke-test PDF gen in CI on every push that touches the function |
| Offline queue corrupts on a phone OS upgrade | Low | High | Versioned SQLite schema with explicit migrations; reset-and-resync fallback if migration fails (the rufero only loses the unsynced delta, not history) |
| Two ruferos race to the same appointment slot from two devices | Low | Medium | DB exclusion constraint catches it; UI surfaces the conflict and re-suggests times |
| Signature PNG corrupted / blank | Medium | Medium | Edge Function validates PNG dimensions and non-trivial pixel count before embedding; rejects empty signatures |
| pg_cron job silently disabled on Supabase free tier or after a project pause | Medium | High | Monitoring query in observability dashboard: "reminders should have fired in the last 2h" alert; manual fallback runbook |
| Homeowner SMS reminder lands at 2am due to timezone bug | Low | High | Reminder send goes through `can_message()` which enforces calling hours — same code path as M4 |
| Photos pile up offline and exhaust device storage | Medium | Medium | Compress at capture (5.9); show a warning banner when `pending_ops` exceeds 100 items or 500MB |
| PDF generation latency > 10s on first cold start | Medium | Low | Pre-warm the Edge Function on tenant login; cache the `pdf-lib` module via Deno's module cache |

---

## 9. Execution order

1. **Pre-reqs**: buckets, pg_cron enabled, `home_base_coords` backfilled, demo data ready
2. **Stage 1** — schema + RPCs (`appointments` exclusion constraint, `suggest_rufero`, `check_appointment_conflict`, `documents`, `inspection_reports`). Must ship first.
3. **Stage 2** — web scheduler + calendar views. Highest-visibility payoff.
4. **Stage 3** — pg_cron reminders. Light backend work; can land in parallel with Stage 4.
5. **Stage 4** — PDF generation + Documents page. Establishes the `generate-pdf` Edge Function contract.
6. **Stage 5** — web e-signature. Depends on Stage 4.
7. **Stage 6** — mobile inspection (photos / form / signature / offline). Can start once Stage 4 ships, finishes last.

Estimated total: **8–10 days** end-to-end (Week 6 + buffer for offline-sync polish).

---

## 10. Success demo script (for client)

Ten minutes, scripted:

1. Log in as `telefonista@demo.com` → open a prospect from M4's "Just talked to them" segment → click **Appt** → modal pre-suggests "Carlos (3.2 mi)" → pick tomorrow 10am → save
2. Switch tabs to the appointments **Calendar** → tomorrow shows the new appointment in "Scheduled" yellow → switch to week view → filter to just Carlos → verify
3. Log in on a second window as `carlos@demo.com` (rufero) → notification bell shows the new assignment → click → lands on the appointment detail
4. Back as telefonista → from the prospect → **New Document** → "3rd Party Authorization" → 3 seconds later it appears in the Documents tab as `generated` → open → preview renders with orange header + correct homeowner name
5. Click **Sign** on the document → signature pad → sign with mouse → Confirm → 3 seconds later status flips to `signed` → both versions visible (unsigned + signed)
6. Show the homeowner inbox (demo email) → signed PDF arrived as attachment
7. Trigger the reminders cron manually via SQL → confirm a 24h SMS landed on the demo homeowner phone
8. Open the Flutter app as Carlos → **Today's appointments** → tap the new appointment → **Start Inspection**
9. Capture 3 photos (Overview, Close-up Damage, Gutters) → fill damage form (Asphalt, 2026-04, severity 4) → all visible in the inspection screen
10. Enable airplane mode on the phone → capture 2 more photos + signature → sync indicator shows 3 pending → turn airplane mode off → indicator clears within 30s → web user sees photos + signature land in real time
11. Refresh the web prospect → Inspection tab shows all 5 photos + the damage report + signed inspection authorization

If all 11 steps work end-to-end with real Telnyx SMS, real SendGrid email, and a real airplane-mode test, M5 is done.
