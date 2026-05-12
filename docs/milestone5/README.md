# Milestone 5 — Appointments + Documents & E-Signature

**Duration:** Week 6
**Goal:** Close the loop from "scheduled inspection" to "signed contract." Telefonistas book inspections on a real calendar with rufero-availability awareness; homeowners get SMS reminders 24h and 2h before the visit; Ruferos arrive on site, capture photos + a damage report on mobile, and walk out with a signed Authorization or Contract PDF — works offline on a rooftop. The web side gets a clean Documents page, a server-side PDF pipeline, and a draw-to-sign flow that emails the signed PDF back to the homeowner.

---

## 1. Why this milestone matters

After M4 the platform can **contact** prospects. After M5 it can **close** them. Every roofing company's revenue lives in the bottleneck this milestone unblocks:

1. **Scheduling** — without a real calendar with conflict checking, Telefonistas double-book ruferos and homeowners no-show. Lost trips cost $80–$150 each.
2. **Reminders** — no-show rate on roofing inspections is 18–25% industry baseline. SMS reminders 24h + 2h before drop that to 6–9%. Single biggest revenue lever in the whole product.
3. **Documents** — 3rd Party Authorization is the form the homeowner signs that lets the roofer talk to the insurance adjuster. Without it, the supplement business in M-future (Tier 4) doesn't exist.
4. **E-signature** — paper contracts in the field are slow, get rained on, and disappear before they make it back to the office. Draw-to-sign in the app shaves a day off every close and gives us an audit trail (IP, timestamp, device, signed-PDF hash).
5. **Mobile offline** — Ruferos work on rooftops in storm zones. The signal goes when they need it most. If the inspection flow falls over offline, the field team rejects the app and the product dies. This is **non-negotiable**.

After M5, the demo is no longer "we have a CRM" — it's "we replaced the entire pen-and-paper + DocuSign + Google-Calendar stack with one app, including offline."

---

## 2. Scope summary (from blueprint M5)

| # | Task | Surface |
|---|------|---------|
| M5-1 | Appointment scheduler — date/time picker, rufero assignment, no-overlap check (2h buffer), proximity suggestion from `home_base_coords`, status → "Scheduled" | Web + DB |
| M5-2 | Calendar views — month / week / day grids, filter by rufero, color-coded by status | Web |
| M5-3 | Appointment status management — Confirm, Cancel (reason required), Complete (rufero), No-show (rufero), Reschedule (creates new row with `rescheduled_from` FK) | Web + Mobile |
| M5-4 | Appointment reminders Edge Function — cron every 60 min, sends SMS 24h + 2h before scheduled time, idempotent | Edge Function |
| M5-5 | PDF generation Edge Function — pdf-lib, 3 templates: 3rd Party Authorization, ACV Contract, RCV Contract. Orange header (#E8501F), homeowner block, body, signature line | Edge Function |
| M5-6 | Document generation workflow — from prospect → New Document → select type → PDF → stored at `{tenant_id}/documents/{prospect_id}/{doc_id}.pdf` → row in `documents` | Web + Storage |
| M5-7 | E-signature web flow — open doc → scrollable preview → signature pad → Clear/Confirm → embed sig PNG into PDF → save signed version separately → notify admin → auto-email signed PDF to homeowner | Web + Edge Function |
| M5-8 | Documents page — list grouped by prospect, columns: name/type/status/created_at, upload, download via signed URL (1h), delete (admin+) | Web |
| M5-9 | Mobile inspection screen — camera → photo type tags (Overview, Front, Back, Sides, Close-up Damage, Gutters, Chimney, Skylights, HVAC, Siding, Evidence, Other), auto-metadata (prospect_id, inspection_id, GPS, timestamp), max 2MB compressed | Mobile |
| M5-10 | Mobile damage form — roof age, material type, storm date, affected-areas checklist, severity scale, scope notes → `inspection_reports` row | Mobile |
| M5-11 | Mobile signature capture — full-screen pad, homeowner name + date, Clear/Confirm, sig PNG → embed Edge Function | Mobile |
| M5-12 | Mobile offline inspection — photos + status updates + notes + signature queued locally (Hive), synced on reconnect with last-write-wins, sync indicator in header | Mobile |

---

## 3. Execution plan — 8 stages

| Stage | Focus | Doc |
|-------|-------|-----|
| 1 | Appointment scheduler — schema additions, modal, rufero availability check, proximity suggestion | [stage-1-appointment-scheduler.md](stage-1-appointment-scheduler.md) |
| 2 | Calendar views + appointment status management + reschedule flow | [stage-2-calendar-and-status.md](stage-2-calendar-and-status.md) |
| 3 | Appointment reminders Edge Function (24h + 2h SMS) | [stage-3-appointment-reminders.md](stage-3-appointment-reminders.md) |
| 4 | PDF generation Edge Function — pdf-lib templates | [stage-4-pdf-generation.md](stage-4-pdf-generation.md) |
| 5 | Document workflow + Documents page | [stage-5-documents-page.md](stage-5-documents-page.md) |
| 6 | E-signature web flow — sig pad → embed → signed PDF → auto-email | [stage-6-esignature-web.md](stage-6-esignature-web.md) |
| 7 | Mobile inspection screen + damage form | [stage-7-mobile-inspection.md](stage-7-mobile-inspection.md) |
| 8 | Mobile signature + offline inspection sync | [stage-8-mobile-signature-offline.md](stage-8-mobile-signature-offline.md) |

**Parallelization:**
- Stages 1 → 2 are sequential (calendar consumes scheduler).
- Stage 3 (reminders) can start once Stage 1's schema lands.
- Stage 4 (PDF Edge Function) is independent — can ship in parallel with appointments work.
- Stages 5–6 chain after Stage 4.
- Stages 7–8 (mobile) need Stage 1's schema (`appointments`, `inspection_reports`) and Stage 4's signature embed Edge Function, but otherwise run in parallel with the web track.

---

## 4. Pre-requisites (must be done before starting M5)

- [ ] **M4 Definition of Done signed off** — specifically: `can_message()` RPC live, Telnyx SMS send path verified, `sms_logs` recording delivery status. Stage 3 reminders ride on this.
- [ ] **Telnyx SMS quota** confirmed sufficient for daily reminder volume (estimate: 2 SMS × daily appointments × tenants). Add Telnyx credit before launch week.
- [ ] **Storage buckets verified present from M1:**
  - `documents` — private, RLS-locked to `{tenant_id}/documents/{prospect_id}/...`
  - `inspection-photos` — private, RLS-locked to `{tenant_id}/inspections/{inspection_id}/...`
  - `signatures` — *new bucket added in Stage 4 pre-reqs*, private, RLS-locked to `{tenant_id}/...`. Holds raw signature PNGs separate from the embedded PDFs.
- [ ] **Tables verified present from M1:** `appointments`, `documents`, `inspection_reports`. Schema additions land as migrations in Stages 1, 4, 7.
- [ ] **`users.home_base_coords`** — populated for every rufero (lat/lng of their base). Stage 1's proximity suggestion is useless without this. Backfill if missing.
- [ ] **Tenant timezone** (already required by M4) — Stage 3 reminders compute 24h-before / 2h-before in tenant local time, not UTC.
- [ ] **pdf-lib in Edge Functions runtime** — Deno-compatible build, pinned version. Verify it imports cleanly in a scratch function before Stage 4.
- [ ] **`signature_pad` package available on web** — `react-signature-canvas` or equivalent. Stage 6.
- [ ] **Flutter `image_picker` + `flutter_signature_pad`** already in `pubspec.yaml` (M1 added `image_picker`; signature_pad needs to be added in Stage 7).
- [ ] **Hive boxes** for offline queue — already wired in M1 (`hive_flutter` in `pubspec.yaml`). Stage 8 adds typed adapters for `PendingPhoto`, `PendingInspection`, `PendingSignature`.
- [ ] **FCM not required for M5** — push notifications land in M6. M5 reminders use SMS only.
- [ ] **Environment variables added** to `.env.example`:
  ```
  PDF_HEADER_COLOR=#E8501F                # configurable per-tenant in M7; default here
  REMINDER_24H_LEAD_MINUTES=1440
  REMINDER_2H_LEAD_MINUTES=120
  REMINDER_FUNCTION_CRON=*/60 * * * *     # every 60 min — registered as pg_cron, not env
  ```

> **Do not start Stage 2 until Stage 1 lands.** Calendar views depend on the appointment row shape Stage 1 finalizes.
> **Do not start Stage 6 until Stage 4 lands.** The signed-PDF embed is a Stage 4 deliverable; Stage 6 is the UI on top.
> **Do not start Stage 8 until Stage 7 lands.** Offline sync needs the inspection write paths Stage 7 establishes.

---

## 5. Key architectural decisions for M5

### 5.1 Appointment availability check is SQL, not client-side

`can_schedule(rufero_id UUID, slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ) RETURNS jsonb` lives in the database. Returns `{allowed: bool, reason: text}`. Reasons: `overlap`, `outside_working_hours`, `rufero_inactive`, `ok`. The scheduler modal calls this RPC before saving; the `appointments` table has an `EXCLUDE` constraint as backstop.

**Why:** Two Telefonistas booking the same rufero at the same time is the most common scheduling failure. Putting the check in SQL with an `EXCLUDE` constraint means concurrent booking attempts can't both win.

### 5.2 2-hour buffer enforced by `tstzrange`, not application code

`appointments` gets `scheduled_range tstzrange GENERATED ALWAYS AS (tstzrange(scheduled_at, scheduled_at + (duration_minutes + 120) * interval '1 minute', '[)')) STORED`. The `EXCLUDE` constraint uses `&&` (overlap) on `(rufero_id, scheduled_range)`.

**Why:** Travel time between sites needs to be expressed in the schema, not as scattered guards. The 120-min buffer is configurable per tenant in M7.

### 5.3 Reminders use idempotent SMS sends keyed on `(appointment_id, reminder_kind)`

`appointment_reminders` table: `(appointment_id, kind, sent_at)`. The Edge Function selects appointments whose `scheduled_at` falls in the 24h-±5min and 2h-±5min windows, joins anti-pattern against `appointment_reminders`, and inserts on success.

**Why:** pg_cron runs every minute. Without an idempotency table, a slow SMS API + retry storm sends the same reminder 30 times.

### 5.4 PDF generation runs in an Edge Function, never in the client

The browser never has the contract template, never sees the un-stamped PDF, never produces the final file. All generation + signature embedding happens server-side in `generate-pdf` and `embed-signature` Edge Functions.

**Why:** Tampering. A signed PDF must be a server-produced artifact whose hash we store. Client-side generation = client-side tampering.

### 5.5 Signed PDF is stored as a **new row**, original kept

`documents.parent_document_id UUID` lets us point from "signed.pdf" to its "unsigned.pdf". We never overwrite. The unsigned version stays for audit (proves the homeowner signed what we generated, not a swapped template).

**Why:** Insurance disputes ask "what exactly did the homeowner sign?" — answer is the SHA-256 of the signed PDF, with the unsigned original as evidence.

### 5.6 Mobile inspection writes to `inspection_reports` + `photos`, photos uploaded separately

Inspection has two write paths:
1. Form data → one `inspection_reports` row (small, synchronous)
2. Photos → one row per photo in `photos` table + binary blob to Storage (large, async, queueable)

Form save can succeed even when 2 photos are still in the upload queue. The inspection record carries `photo_count_expected` so the UI can show "5 of 7 photos uploaded — sync pending."

**Why:** Photos are 1–2 MB each on slow connections. Blocking the whole inspection write until every photo finishes is the #1 reason field apps fail in offline-heavy environments.

### 5.7 Last-write-wins for offline conflicts, but with audit

If a rufero edits an inspection offline and an admin edits the same record online, the offline write wins on reconnect — but the overwritten admin edit is logged to `activities` with `source = 'conflict_lost'`. The rufero never sees a conflict dialog (field UX rule: never block on a rooftop).

**Why:** Conflict dialogs in the field are abandoned. Last-write-wins is the only workable strategy. Audit trail makes the silent overwrite recoverable.

### 5.8 Signature PNGs stored raw, embedded copy lives in the signed PDF only

`signatures/{tenant_id}/{document_id}.png` keeps the raw signature. The embedded version inside the signed PDF is the legal artifact. We need both: raw for re-rendering if a tenant changes their PDF template, embedded for signed-PDF integrity.

**Why:** A future M7+ "re-generate this contract with the new logo" workflow needs the raw sig.

### 5.9 No DocuSign, no third-party e-sig provider

E-signature is fully in-house: HTML5 canvas → PNG → pdf-lib `drawImage()` into a known PDF coordinate. We log device, IP, user agent, timestamp into `documents.signature_metadata jsonb`.

**Why:** $0.50–$3.00 per signed envelope from DocuSign at our volume is a $4k–$15k/month line item. Our use case is single-party signing, single-page acknowledgement — DocuSign's full audit-trail machinery is overkill.

### 5.10 Reminder SMS body is template-driven, but the *template ID* is tenant-scoped

Stage 3 uses `tenants.sms_templates` (already populated in M4 schema). Reminder Edge Function picks the template tagged `kind: 'appointment_reminder_24h'` / `kind: 'appointment_reminder_2h'`. Fallback to a hardcoded default if a tenant hasn't configured one.

**Why:** Reuses the M4 template plumbing. No new table, no separate config UI in M5.

---

## 6. Definition of Done

### Web — Appointments
- [ ] Telefonista clicks **Appt** on any prospect → scheduler modal opens with date/time picker, rufero dropdown (only active ruferos shown)
- [ ] Modal suggests the closest available rufero by default (by `home_base_coords` distance to prospect)
- [ ] Picking an overlapping slot for the same rufero shows inline error "Conflict: existing appointment 2:00–3:00 PM" before the Save button enables
- [ ] Saving → row in `appointments`, prospect status auto-updates to `appointment_set`, activity logged
- [ ] Calendar page renders Month / Week / Day toggles
- [ ] Color coding: pending (gray), confirmed (blue), completed (green), cancelled (red), no-show (orange), rescheduled (purple)
- [ ] Filter by rufero (single or all)
- [ ] Click a calendar event → side drawer with prospect info + actions (Confirm, Cancel-with-reason, Reschedule, Complete, No-show — role-gated)
- [ ] Cancel requires a reason text field (saved to `cancellation_reason`)
- [ ] Reschedule opens scheduler modal pre-filled, saves as a new row with `rescheduled_from = old_id`, old row marked `status = 'rescheduled'`

### Web — Reminders
- [ ] Booking an appointment for tomorrow at 2pm → SMS arrives on the homeowner phone at ~2pm today (24h-before)
- [ ] Same appointment → SMS arrives at ~12pm tomorrow (2h-before)
- [ ] Replaying the cron 5× in 5 minutes → exactly one of each reminder sent (idempotency)
- [ ] Reminder SMS body uses the tenant's configured template with `{homeowner_name}`, `{appointment_time}`, `{company_name}` placeholders substituted
- [ ] Cancelling an appointment 5h before stops the 2h reminder

### Web — Documents
- [ ] From any prospect → **New Document** → select type (Authorization / ACV / RCV) → PDF appears in Documents tab within 5s
- [ ] PDF rendered server-side with orange header, homeowner block, body text, signature line, "Electronically signed via Roof-Aid CRM" footer
- [ ] Documents page lists all docs grouped by prospect, sortable by created_at, filterable by status
- [ ] Download button → 1-hour signed URL → file streams in browser
- [ ] Admin can delete with a confirm modal; non-admin can't see the button
- [ ] Upload existing PDF → row in `documents` with `source = 'upload'`

### Web — E-Signature
- [ ] Open an unsigned doc → scrollable PDF preview at top, signature pad anchored at bottom
- [ ] Clear button wipes the pad; Confirm disabled until at least one stroke drawn
- [ ] Confirm → loading state ~3s → signed PDF appears, document status → `signed`
- [ ] Homeowner receives an email with the signed PDF attached
- [ ] `documents.signature_metadata` populated with `{signed_at, ip, user_agent, device_type, sha256}`
- [ ] Original unsigned doc still downloadable for audit

### Mobile — Inspection
- [ ] Rufero opens an assigned appointment → "Start Inspection" CTA → inspection screen
- [ ] Camera button → take photo → photo type chip selector overlay → tap one → photo saved to local queue with tags
- [ ] Form: roof age, material, storm date, areas (multi-select chips), severity (1–5), notes
- [ ] Save form → `inspection_reports` row written (online) or queued (offline)
- [ ] Photo count badge shows "5 of 7 uploaded" while queue drains in background

### Mobile — Signature + Offline
- [ ] Sign button → full-screen pad → homeowner name + date displayed → Clear / Confirm
- [ ] Confirm offline → signature PNG queued locally, status shown as "Pending sync"
- [ ] Airplane mode → complete the full flow (photos + form + signature) → re-enable network → within 60s all data syncs, signed PDF generated server-side, document status → `signed`
- [ ] Sync indicator in app header reflects state (`All synced` / `Syncing 3 items…` / `12 pending`)
- [ ] No data loss across app restarts while offline

### Cross-cutting
- [ ] All Storage paths tenant-scoped (`{tenant_id}/...`); verified with RLS test: tenant B user cannot fetch tenant A's signed PDF or photo
- [ ] All Edge Functions verify the caller's tenant matches the resource's tenant before serving
- [ ] Reminder cron logs visible in Supabase logs; alert on > 60s runtime
- [ ] `EXCLUDE` constraint on `appointments` proven by attempting two concurrent overlapping inserts (one fails)

---

## 7. Out of scope for M5 (deferred)

- **Push notifications** (FCM) → M6. M5 reminders are SMS-only.
- **Full offline mode for non-inspection screens** → M6. M5 offline is scoped to the inspection flow.
- **AI damage detection / computer vision** (Tier 5) → M-future.
- **Multi-party e-signature** (homeowner + spouse, or two contractors) → M-future. M5 is single-party.
- **DocuSign / HelloSign integration** as fallback → not on roadmap. In-house e-sig only.
- **Recurring appointments** → not on roadmap; not a roofing workflow.
- **Calendar sync to Google / Outlook** → M-future.
- **Photo annotation / drawing on photos** → M-future. M5 captures raw photos only.
- **Damage form custom field builder** → M7+. M5 has a fixed schema.
- **Per-tenant PDF template customization** beyond header color/logo → M7. M5 uses 3 hardcoded templates.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Telnyx SMS reminder fails silently → no-show spike | Medium | High | `appointment_reminders` rows track `sent_at` + `provider_message_id`. Alert if a reminder is queued but `sent_at` is null > 10 min. |
| Two Telefonistas book the same rufero slot concurrently | Medium | Medium | DB-level `EXCLUDE` constraint guarantees one fails. UI shows the conflict + lets the loser pick a new slot. |
| pdf-lib build issue under Deno → Stage 4 blocked | Medium | High | Spike during pre-reqs: verify import + render a hello-world PDF in a scratch function before Stage 4 starts. Fall back to `@react-pdf/renderer` running in a Node Edge runtime if needed. |
| Signature embedding misaligns on PDFs with non-letter page size | Low | Medium | All 3 templates use fixed Letter (8.5×11) layout in M5. Coordinates hardcoded. M7 adds template editor. |
| Offline queue corrupts on app crash mid-write | Low | **Critical** | Use Hive's atomic `transaction` API; never write partial photo metadata + binary separately. Test by killing the app process mid-inspection. |
| Photo upload retry loop drains battery | Medium | Medium | Exponential backoff (10s → 30s → 2m → 10m → 30m), with a manual "Retry now" button. Cap retries at 24h, then surface as a hard error requiring user action. |
| Homeowner doesn't receive emailed signed PDF | Medium | Medium | SendGrid bounce webhook (already in M4) updates `documents.email_status`. Surface "Email bounced — re-send to a different address" in the Document detail. |
| Storage costs balloon (photos + signed PDFs) | Low | Medium | Lifecycle policy on `inspection-photos` bucket: cold tier after 90d. PDFs are tiny (~50KB) — no policy needed. |
| Concurrent edits during long-running offline sync | Low | Medium | Last-write-wins (5.7) with `activities` audit log; surface lost edits in admin view in M7. |

---

## 9. Execution order

1. **Pre-reqs:** verify M4 sign-off, populate `home_base_coords`, spike pdf-lib under Deno, add `signatures` bucket.
2. **Stage 1** — appointment scheduler: schema migrations, `can_schedule()` RPC, scheduler modal. Must ship first.
3. **Stage 2** — calendar views + status management. Builds on Stage 1's row shape.
4. **Stage 3** — appointment reminders Edge Function. Can start once Stage 1's schema lands; parallelizes with Stage 2.
5. **Stage 4** — PDF generation Edge Function. Independent; parallelizes with Stages 1–3.
6. **Stage 5** — document workflow + Documents page. Depends on Stage 4.
7. **Stage 6** — e-signature web flow. Depends on Stages 4 + 5.
8. **Stage 7** — mobile inspection screen + damage form. Can start once Stage 1's schema (`appointments`) lands; parallelizes with Stages 2–6.
9. **Stage 8** — mobile signature + offline sync. Depends on Stage 4's embed Edge Function + Stage 7's inspection write path.

Estimated total: **9–11 days** end-to-end (Week 6 + buffer). M5 is the largest milestone — protect the buffer.

---

## 10. Success demo script (for client)

Ten minutes, two devices (web + phone), scripted:

1. Log in as `telefonista@demo.com` → open any prospect → click **Appt**
2. Scheduler modal opens; default rufero is "Carlos (3.2 mi away)" — closest available; pick tomorrow 2:00 PM
3. Try to set the same rufero at 2:30 PM → inline error "Conflict: existing appointment 2:00–3:00 PM" → pick 4:00 PM → save
4. Open the **Calendar** page → switch to Week view → see both appointments on tomorrow's column, color-coded
5. Click the 4:00 PM appointment → side drawer → click **Confirm** → color shifts blue → activity logs the action
6. Back on the prospect → click **New Document** → select "3rd Party Authorization" → PDF appears in Documents tab in ~3s
7. Open the PDF → orange header, homeowner block populated, signature line at bottom
8. (Pre-stage: a fake reminder cron run shows the 24h SMS arrived on the QA homeowner phone — show the inbox)
9. Switch to the Flutter app as `rufero@demo.com` → open tomorrow's appointment → **Start Inspection**
10. **Enable airplane mode** (visible to the room) → take 3 photos with type tags (Overview, Front, Close-up Damage) → fill the damage form (asphalt shingle, 18 yrs, hail 1.25"+, areas: roof + gutters, severity 4) → save → status shows "Pending sync"
11. Tap **Get Signature** → full-screen pad → homeowner name "Jane Smith" → draw → Confirm → status "Pending sync"
12. **Disable airplane mode** → header switches "Syncing 7 items…" → 30 seconds later "All synced"
13. Back on web → refresh the prospect → Documents tab now shows the signed Authorization with status `signed`, signature embedded
14. QA homeowner inbox shows the signed PDF email arrived
15. Cancel the 2:00 PM appointment with reason "Homeowner requested" → confirm the 2h reminder does NOT send by waiting through the window

If all 15 steps work end-to-end with real Telnyx SMS, real PDF generation, real offline → online sync, M5 is done.
