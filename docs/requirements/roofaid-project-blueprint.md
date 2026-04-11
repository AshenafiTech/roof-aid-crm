# Roof-Aid CRM — Complete Project Blueprint

> Version 1.0 | 2026-04-09 | Derived from SRS v4.0 + Project Plan v1.1

---

## 1. Project Understanding

### 1.1 What Roof-Aid Is

Roof-Aid CRM is a **vertical SaaS platform built exclusively for the roofing industry**. It unifies the entire roofing company workflow — from storm-triggered lead generation, automated/human calling, field inspection, contract signing, insurance supplement filing, and AI-powered damage assessment — into one cloud-based, multi-tenant system.

### 1.2 Core System Goals

| Goal | Description |
|------|-------------|
| **Unify workflow** | Replace 5-8 disconnected tools (spreadsheets, dialers, paper contracts) with one platform |
| **Multi-tenant SaaS** | One codebase serves all roofing companies with complete data isolation |
| **Tiered monetization** | 5 subscription tiers, each unlocking more automation; designed as an upsell engine |
| **Mobile-first field ops** | Native Flutter app for Ruferos (field inspectors) who work on rooftops with poor connectivity |
| **Commission revenue** | Platform takes 10% of insurance supplement claim values (Tier 4) |
| **AI integration-ready** | Stubs for AI calling (Tier 3) and computer vision (Tier 5) baked into architecture from day one |

### 1.3 Revenue Model

| Tier | Name | Model | Key Features |
|------|------|-------|-------------|
| 1 | CRM Core | Monthly subscription | Prospect pipeline, softphone, SMS/email, appointments, documents, mobile app |
| 2 | CRM + Leads | Higher subscription | + Storm lead auto-import, radar map overlay |
| 3 | CRM + AI Calls | Higher subscription | + AI calling agent (auto-dials, qualifies, schedules) |
| 4 | Supplements | 10% commission | + ML supplement writing assistant |
| 5 | AI Inspection | Per-inspection fee | + Computer vision roof damage analysis |

### 1.4 User Roles (6 roles)

| Role | Scope | Primary Function |
|------|-------|-----------------|
| **Super Admin** | Platform | Manages all tenants, billing, platform config. Invisible to tenants |
| **Owner** | Tenant | Roofing company owner. Full access including billing |
| **Admin** | Tenant | Office manager. Full prospect/user access. No billing |
| **Telefonista** | Tenant | Call agent. Searches, contacts, schedules prospects. No admin |
| **Rufero** | Tenant | Field inspector. Sees only assigned prospects. Mobile app primary |
| **AI Agent** | System | Automated caller. Logged with source=ai-agent |

### 1.5 Technology Stack (Actual Implementation)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | Differs from SRS (which said Firebase Hosting + React). Supabase replaces Firebase |
| Backend/DB | Supabase (PostgreSQL + RLS + Edge Functions + Realtime) | Replaces Firestore. SQL with Row Level Security |
| Mobile App | Flutter (DDD + BLoC) | SRS said React Native — changed to Flutter for better native perf |
| Telephony | Telnyx (WebRTC + SMS) | As specified |
| Email | SendGrid | As specified |
| Payments | Stripe | As specified |
| Maps | Google Maps | As specified |
| PDF | pdf-lib (in Edge Functions) | As specified |
| CI/CD | GitHub Actions + Vercel | As specified |

> **Important architectural deviation:** The SRS was written for Firebase (Firestore, Cloud Functions, Firebase Auth). The actual implementation uses **Supabase** (PostgreSQL, Edge Functions, Supabase Auth). This is a strategic improvement — SQL with RLS provides stronger multi-tenant isolation than Firestore Security Rules, and PostgreSQL supports PostGIS for spatial queries. All SRS concepts still apply but are implemented with Supabase equivalents.

### 1.6 Key Architectural Constraints

- **Multi-tenancy is non-negotiable** — every query, every function, every security rule must be tenant-aware. `tenant_id` is always the first filter
- **Feature flags control tier access** — stored in `tenants.features` JSONB, checked at runtime, never compile-time
- **No hardcoded values** — all prices, configs from `platform_config` table or environment variables
- **60-record pagination** — Anti-Collision System requires exactly 60 records per page with rotating display order
- **DNC compliance is critical** — TCPA violations cost $500-$1,500 per call. System must enforce DNC at every layer
- **Offline mandatory for mobile** — Ruferos work on rooftops with no signal

---

## 2. Project Plan Analysis

### 2.1 Timeline Overview

| M# | Period | Focus | Client Acceptance Criteria |
|----|--------|-------|--------------------------|
| M1 | Weeks 1–2 | Foundation & Multi-Tenant Core | Monorepo ready, Supabase live, Next.js + Flutter run locally, 15 tables + RLS, tenant provisioning works |
| M2 | Weeks 2–3 | Prospect Pipeline + Dashboard | Web dashboard with 60-record Anti-Collision list. Mobile basic prospect list. Real-time updates |
| M3 | Week 4 | Dashboard Polish + Maps | Full dashboard, Google Maps, proximity search, prospect profile tabs. Mobile map view functional |
| M4 | Week 5 | Communication (Phone/SMS/Email) | Telnyx softphone working, SMS inbox, SendGrid emails, DNC compliance. Mobile SMS reply |
| M5 | Week 6 | Appointments + Documents & E-Signature | Calendar, appointment flow, PDF contracts, e-signature. Mobile: full inspection screen + signature + offline |
| M6 | Week 7 | Mobile Deep Dive + Offline | Mobile offline mode, photo upload, document viewer, push notifications fully working |
| M7 | Week 8 | Admin, Analytics & Onboarding | Admin panel, CSV import, basic analytics, onboarding checklist. Mobile settings polished |
| M8 | Weeks 9 | Billing & Security | Stripe trial/subscription, security audit |
| M9 | Week 10 | QA & Launch | Full end-to-end testing, deploy to production, go-live ready |

### 2.2 Current Status (M1 Assessment)

**Completed (Stages 1–7):**
- Monorepo scaffold (pnpm + Turborepo)
- Next.js web app with route structure, shadcn/ui, auth (login, middleware, dashboard shell)
- Flutter mobile app with DDD structure, auth BLoC, login page
- Supabase: 15 tables, indexes, helper functions, triggers
- RLS policies on all tables + 3 private storage buckets
- `provision-tenant` Edge Function (creates tenant + user + Stripe customer)
- Auth integration (web login + mobile login)

**Not completed (Stage 8):**
- No CI/CD workflows (no `.github/workflows/*.yml` files exist)
- No Vercel configuration

**Structural gaps for M1 sign-off:**
- All dashboard pages are placeholder stubs (`<div>text</div>`)
- No sidebar navigation — only a top bar with sign-out
- No seed data for testing
- No generated database types (`database.types.ts` is placeholder)
- Storage RLS policies not implemented (files not tenant-scoped)
- No password reset flow

**Assessment:** M1 is approximately **70% complete**. The infrastructure is solid, but the CI/CD (Stage 8) and verification checklist items are missing. The stub pages are acceptable for M1 — they become real in M2/M3.

---

## 3. Detailed Milestone Breakdown

---

### M1 — Foundation & Multi-Tenant Core (Weeks 1–2)

**Purpose:** Establish the complete infrastructure foundation. Every subsequent milestone builds on top of this.

**Status: ~70% done. Remaining work below.**

#### Remaining Tasks

| # | Task | Priority | Details |
|---|------|----------|---------|
| M1-1 | Generate Supabase database types | Critical | `npx supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts`. All future queries depend on this |
| M1-2 | Create seed data | Critical | `supabase/seed/seed.sql`: 1 tenant, 4 users (owner/admin/telefonista/rufero), 15 prospects, 5 appointments, sample notes/activities. Required for testing everything from M2 onward |
| M1-3 | Storage RLS policies | High | Add policies to `storage.objects` so users can only access files in their tenant's path (`{tenant_id}/...`) |
| M1-4 | GitHub Actions — web workflow | High | `.github/workflows/web.yml`: lint + build on PR, trigger Vercel deploy on push to main |
| M1-5 | GitHub Actions — mobile workflow | High | `.github/workflows/mobile.yml`: flutter analyze + build APK on PR, upload artifact |
| M1-6 | Vercel deployment | High | Connect repo, set root directory to `apps/web`, add env vars, verify deployment |
| M1-7 | Password reset flow | Medium | "Forgot password?" on login → Supabase `resetPasswordForEmail()` → `/reset-password` page |
| M1-8 | Env documentation | Low | Verify `.env.example` documents all secrets, update if any are missing |

#### Key Deliverables
- [ ] `pnpm dev` → Next.js at localhost:3000 without errors
- [ ] `flutter run` → login screen on simulator
- [ ] 15 tables visible in Supabase dashboard
- [ ] RLS: Tenant A user gets 0 rows from Tenant B's data
- [ ] `provision-tenant` returns tenant_id + owner credentials
- [ ] Owner logs in on web and mobile
- [ ] Storage buckets are private and tenant-scoped
- [ ] CI/CD: push to main triggers Vercel deploy; mobile build runs on PR

#### Dependencies
- None (this is the foundation)

---

### M2 — Prospect Pipeline + Dashboard (Weeks 2–3)

**Purpose:** Build the core CRM feature — the prospect pipeline that Telefonistas use all day. This is the product's primary value.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M2-1 | **Sidebar navigation** | Collapsible sidebar with links: Dashboard, Prospects, Appointments, Documents, Communications. Admin section (Users, Analytics, Settings) visible to owner/admin only. Active route highlighting. Responsive (sheet on mobile) |
| M2-2 | **Prospects list page** (`/prospects`) | Table view with 60-record pagination (Anti-Collision System). Columns: name, address, city, status, assigned_to, hail_size, home_value. 6 action buttons per card: Call, SMS, Email, Appt, Go, Notes. Filter bar: city dropdown, status dropdown (6 statuses: New Leads, Prospects, Contacted, Scheduled, Closed Customer, Not Viable), quick text filter, "Query Database" button. Role-based: rufero sees only assigned |
| M2-3 | **Prospect detail page** (`/prospects/[id]`) | Tabbed profile: Overview (all fields + edit form), Pipeline (status history), Assignment (assigned rufero + reassignment), Activity (audit log from `activities`), Notes (add/view from `notes` table). Status change workflow with role guards |
| M2-4 | **Dashboard home with real metrics** | Query Supabase for counts: prospects by status, today's appointments, unread notifications. Display in metric cards. Role-based visibility |
| M2-5 | **Real-time updates** | Enable Supabase Realtime on `prospects`, `notifications`. Dashboard and prospect list auto-update when data changes |
| M2-6 | **Install required shadcn/ui components** | Table, Dialog, Select, Tabs, Badge, DropdownMenu, Sheet (sidebar), Avatar, Separator, Calendar, Command (search) |
| M2-7 | **Create shared components** | `DataTable` (sortable, filterable, paginated), `StatusBadge` (color-coded by status), `PageHeader` (title + description + action), `ProspectCard` (for list view) |
| M2-8 | **Supabase views for dashboard** | `prospect_counts_by_status` view, `upcoming_appointments` view, `unread_notification_count` function |
| M2-9 | **Mobile: basic prospect list** | Flutter screen showing assigned prospects. Pull to refresh. Tap to view detail. Filter by status |
| M2-10 | **Mobile: real-time sync** | Supabase Realtime subscription for assigned prospects. Auto-update list when prospect changes |

#### Key Deliverables
- [ ] Telefonista can filter by city + status, click "Query Database", see 60 results
- [ ] Prospect cards show 6 action buttons (Call/SMS/Email/Appt/Go/Notes)
- [ ] Click a prospect → full profile with tabs
- [ ] Status changes logged in activity table
- [ ] Dashboard shows real counts
- [ ] Real-time: prospect status changes appear without page reload
- [ ] Mobile: rufero sees assigned prospects list

#### Dependencies
- M1 complete (seed data, database types)

---

### M3 — Dashboard Polish + Maps (Week 4)

**Purpose:** Add Google Maps integration, proximity search, and polish the prospect profile into a fully functional record view.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M3-1 | **Google Maps on dashboard** | Right panel map showing all prospect results as color-coded pins by status. Map auto-zooms to fit results. Click pin → highlight corresponding card and scroll to it in list |
| M3-2 | **Proximity search** | Right-click on map → Proximity Search modal: center point (auto-set from click), radius selector (5/10/25/50 miles), status filter, Search button. Uses PostGIS `ST_DWithin` on `coordinates` column. Top bar proximity button uses GPS location |
| M3-3 | **Full prospect profile tabs** | Complete all remaining tabs: Calls (from `call_logs`), SMS (threaded conversation from `sms_logs`), Email (from `email_logs`), Appointments (related from `appointments`), Documents (from `documents` with download via signed URL), Inspection (from `inspection_reports` with photos), Map (mini embedded map with Street View link) |
| M3-4 | **Prospect create/edit form** | Full form with Zod validation. Fields: name, address, city, state, zip, phone(s), email, home_value, hail_size, tipo, source. Geocode address → coordinates on save |
| M3-5 | **Prospect assignment** | Assign prospect to rufero (owner/admin only). Assignment logged in activity. Notification sent to rufero |
| M3-6 | **DNC flag management** | DNC toggle accessible only from full profile (not card — prevents accidental flagging). Reason required. Timestamp recorded. DNC disables Call and SMS buttons everywhere. DNC records never deleted |
| M3-7 | **Mobile: map view** | Google Maps showing assigned prospect pins. Tap pin → prospect detail. "Navigate" button opens Google Maps/Apple Maps for turn-by-turn directions |
| M3-8 | **Mobile: prospect detail tabs** | Overview, Calls, SMS, Appointments, Documents, Inspection, Notes tabs matching web |

#### Key Deliverables
- [ ] Map shows color-coded pins for all filtered prospects
- [ ] Proximity search returns results within selected radius
- [ ] All prospect profile tabs show real data
- [ ] DNC flag disables communication buttons
- [ ] Mobile: map with navigation to prospect address
- [ ] Prospect create/edit form validates and geocodes

#### Dependencies
- M2 (prospect list, dashboard metrics, shared components)
- Google Maps API key configured

---

### M4 — Communication: Phone/SMS/Email (Week 5)

**Purpose:** Enable the core communication tools that Telefonistas use to contact prospects. This is where the CRM becomes a revenue-generating tool.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M4-1 | **WebRTC softphone component** | Telnyx WebRTC integration. UI: microphone selector, voice level meter, number input, CALL/MUTE/HOLD/TRANSFER/HANGUP buttons. Incoming call banner (Caller ID + Accept/Reject). Connection status indicator in nav bar. Debug log panel |
| M4-2 | **Click-to-call** | From any prospect card or profile, click Call → number pre-populated, softphone dials. Outbound Caller ID = agent's Telnyx extension |
| M4-3 | **Call disposition** | After hangup: disposition prompt (Answered/No Answer/Voicemail/Wrong Number/DNC Request/Callback Requested). Record saved to `call_logs`. Activity logged |
| M4-4 | **Call recording** | All calls recorded to Supabase Storage `call-recordings/{tenant_id}/{call_id}.mp3`. Recording disclosure played at call start (configurable per tenant) |
| M4-5 | **Telnyx webhook Edge Function** | `supabase/functions/telnyx-webhook/index.ts`. Handles: inbound call routing (identify tenant → match extension → route to agent WebRTC session), inbound SMS routing, call events (answered, hangup). Always return 200 to Telnyx |
| M4-6 | **SMS module** | Two-way threaded conversation view per prospect. Personal extension number as sender. SMS templates (pre-written, selectable). Character count + segment counter (160 chars/segment). Delivery status tracking. Auto opt-out: STOP keyword → DNC flag |
| M4-7 | **Email module** | Compose: To (pre-filled from prospect), Subject, Body (rich text). Personal sender via SendGrid subuser. Email templates per document type. All emails logged to `email_logs` |
| M4-8 | **SendGrid webhook** | Inbound email parsing. Bounce handling (marks email as invalid). Spam complaint handling |
| M4-9 | **DNC compliance enforcement** | DNC flag disables Call and SMS buttons. Calling hours enforcement (8am-8pm local time, configurable per tenant). Auto-DNC on SMS STOP reply. All DNC events logged permanently |
| M4-10 | **Notification bell** | Bell icon in nav bar showing unread count. Real-time via Supabase subscription on `notifications` table. Dropdown showing recent notifications. Mark as read. Click navigates to related record |
| M4-11 | **Mobile: SMS reply** | Threaded SMS view for assigned prospects. Reply from app. Unread count badge |

#### Key Deliverables
- [ ] Telefonista can click Call from prospect card → softphone dials → call recorded → disposition logged
- [ ] Two-way SMS conversation works with delivery status
- [ ] Email compose and send works via SendGrid
- [ ] DNC flag disables all communication for that prospect
- [ ] Calling hours enforced — cannot call outside configured window
- [ ] Inbound calls route to correct agent
- [ ] Notification bell shows real-time unread count
- [ ] Mobile: SMS reply for assigned prospects

#### Dependencies
- M3 (prospect profile tabs for Calls/SMS/Email)
- Telnyx API key + number provisioned
- SendGrid API key + subuser configured

---

### M5 — Appointments + Documents & E-Signature (Week 6)

**Purpose:** Complete the appointment scheduling workflow and document generation/signing pipeline — the path from "interested prospect" to "signed contract."

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M5-1 | **Appointment scheduler** | From prospect card, click Appt → modal: select date/time, assign rufero. Calendar shows rufero availability (no overlapping within 2h buffer). Suggest closest available rufero based on `home_base_coords` distance to prospect. Appointment creates → prospect status → "Scheduled" |
| M5-2 | **Calendar views** | Appointments page: month view, week view (hour-by-hour grid), day view. Filter by rufero (individual or all). Color coding by appointment status. |
| M5-3 | **Appointment status management** | Telefonista/Admin: Confirm, Cancel (reason required). Rufero: Complete, No-show. Reschedule creates new appointment with `rescheduled_from` FK. Status changes trigger notifications |
| M5-4 | **Appointment reminders Edge Function** | `sendAppointmentReminder` scheduled function (runs every 60 min). Sends SMS to homeowner 24h and 2h before appointment |
| M5-5 | **PDF generation Edge Function** | `supabase/functions/generate-pdf/index.ts` using pdf-lib. Templates: 3rd Party Authorization, ACV Contract, RCV Contract. PDF includes: orange header bar (#E8501F) with company name, homeowner info block, document-specific body text, signature line, "Electronically signed via Roof-Aid CRM" footer |
| M5-6 | **Document generation workflow** | From prospect profile → New Document → select type → Cloud Function generates PDF → stored at `{tenant_id}/documents/{prospect_id}/{doc_id}.pdf` → record in `documents` table → available for signing |
| M5-7 | **E-signature flow (web)** | Open document → scrollable PDF preview → signature pad at bottom → Clear/Confirm → signature PNG sent to Edge Function → embeds signature into PDF → signed version saved separately → `documents.status` = 'signed' → Admin notified → signed PDF emailed to homeowner |
| M5-8 | **Documents page** | List documents grouped by prospect. Columns: prospect name, type, status (generated/sent/signed), created_at. Upload PDF, download via signed URL (1-hour expiry), delete (admin+ only with confirmation) |
| M5-9 | **Mobile: full inspection screen** | Camera → select photo type from tags (Overview, Front, Back, Left Side, Right Side, Close-up Damage, Gutters, Chimney, Skylights, HVAC, Siding, Evidence, Other). Auto-metadata: prospectId, inspectionId, GPS, timestamp. Max 2MB per photo (compressed). Upload to `inspection-photos/{tenant_id}/{inspection_id}/{photo_id}.jpg` |
| M5-10 | **Mobile: damage form** | Roof age, material type, storm date, affected areas checklist, severity scale, scope notes. Saves to `inspection_reports` table |
| M5-11 | **Mobile: signature capture** | Full-screen signature pad. Homeowner name and date shown. Clear/Confirm. Signature PNG sent to Edge Function |
| M5-12 | **Mobile: offline inspection** | Photos queued locally when offline. Status updates and notes queued. Signature stored locally. All synced on reconnect with conflict resolution. Sync status indicator in app header |

#### Key Deliverables
- [ ] Telefonista schedules appointment → rufero gets push notification
- [ ] Homeowner receives SMS confirmation + reminders (24h, 2h)
- [ ] Calendar views show all appointments with color coding
- [ ] PDF documents generated with professional layout
- [ ] E-signature flow works: generate → sign → store signed version
- [ ] Mobile: full inspection workflow (photos → form → signature) works offline
- [ ] Signed documents auto-emailed to homeowner

#### Dependencies
- M4 (SMS for reminders, notification system)
- Telnyx SMS for appointment reminders

---

### M6 — Mobile Deep Dive + Offline (Week 7)

**Purpose:** Harden the mobile app for field use. Offline mode is mandatory — Ruferos work on rooftops with no signal.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M6-1 | **Full offline mode** | Cache assigned prospects + appointment details locally (Hive). Photos stored in device queue → upload on reconnect. Status updates queued → synced with last-write-wins conflict resolution. Offline indicator in header. Sync status: "Syncing 3 items..." → "All synced" |
| M6-2 | **Photo upload pipeline** | Retry failed uploads 3x automatically. Manual retry button if still failing. Progress indicator per photo. Never lose a photo — preserved locally until upload succeeds |
| M6-3 | **Document viewer** | View signed PDFs in-app with pinch-zoom. Share via email/AirDrop/Android share sheet. Download to device |
| M6-4 | **Push notifications (FCM)** | Firebase Cloud Messaging integration. Notification types: new appointment assigned, document signed, inbound call/SMS. Tap navigates to relevant record. FCM token stored in `users.fcm_token` |
| M6-5 | **My Schedule screen** | Today's and upcoming appointments chronologically. Date navigation. Tap to open appointment detail with prospect info, address, notes, status buttons (Confirm/Complete/No-show/Cancel), Navigate button, Call/SMS homeowner buttons |
| M6-6 | **Mobile navigation** | "Navigate" button opens Google Maps/Apple Maps with turn-by-turn directions to prospect address |
| M6-7 | **Biometric auth** | Face ID / fingerprint on subsequent sessions. Stored session token encrypted locally |
| M6-8 | **Settings screen** | Profile photo, notification preferences (toggle each type), biometric toggle, app version, logout |

#### Key Deliverables
- [ ] Rufero completes full inspection offline → all data synced when connection restores
- [ ] No data loss: photos, signatures, notes all preserved locally until uploaded
- [ ] Push notifications arrive on mobile for key events
- [ ] Navigate button opens maps with directions
- [ ] My Schedule shows today's appointments with all action buttons
- [ ] Biometric login works on subsequent sessions

#### Dependencies
- M5 (inspection screen, signature, document viewer)
- FCM setup in Firebase Console

---

### M7 — Admin, Analytics & Onboarding (Week 8)

**Purpose:** Give Owners and Admins the tools to manage their team, import data, understand performance, and onboard new tenants.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M7-1 | **User management** (`/admin/users`) | List all tenant users. Create/invite new user (calls Supabase Auth admin API). Edit role (owner only). Deactivate/reactivate. Force password reset. Assign Telnyx extensions |
| M7-2 | **Prospect assignment panel** | Bulk-assign by city, status, or zone. View unassigned leads. Manual reassignment. Auto-assignment by proximity (suggest closest rufero) |
| M7-3 | **CSV lead import** | Upload CSV → field mapping UI → duplicate detection (match by address) → preview before committing → batch import in chunks of 500 → progress indicator. DNC check on imported records |
| M7-4 | **Activity log** | Real-time feed of all system events. Filterable by user, prospect, action type, date range |
| M7-5 | **City management** | Add/remove cities in the tenant's city dropdown |
| M7-6 | **Message templates** | SMS and email templates. Create, edit, activate/deactivate. Templates selectable when composing SMS/email |
| M7-7 | **Tenant settings** | Company name, logo, address, timezone, service area (cities + center point + radius). Calling hours configuration per day of week |
| M7-8 | **Basic analytics** (`/admin/analytics`) | Pipeline funnel (leads → prospects → contacted → scheduled → closed). Conversion rate. Calls made by agent. Appointments set rate. No-show rate. Close rate. Agent leaderboard |
| M7-9 | **Onboarding checklist** | Persistent panel for new Owner accounts. 7 steps: company logo/address, add team member, import leads, make first call, schedule appointment, generate contract, download mobile app. Progress shown as "3 of 7 complete." Dismissible after 7/7 |
| M7-10 | **Super admin panel** (`/super-admin`) | List all tenants (name, slug, plan, trial status, user count). Provision new tenant (calls Edge Function). Suspend/unsuspend/cancel. Override feature flags. Platform-wide analytics (total tenants, MRR, commission revenue, active users). View platform_config |
| M7-11 | **Mobile: settings polish** | Profile editing, notification preferences, biometric toggle, app version |

#### Key Deliverables
- [ ] Owner can invite team members with assigned roles
- [ ] CSV import with duplicate detection handles 10,000 records
- [ ] Analytics show pipeline funnel and key metrics
- [ ] Onboarding checklist tracks new owner progress
- [ ] Super admin can provision tenants and view platform metrics
- [ ] Calling hours configurable per day/timezone

#### Dependencies
- M4 (communication modules for calling hours)
- M5 (documents for onboarding step 6)
- M6 (mobile app for onboarding step 7)

---

### M8 — Billing & Security (Week 9)

**Purpose:** Implement Stripe billing for trial-to-paid conversion and conduct a security audit before production.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M8-1 | **Stripe subscription setup** | One Stripe Product per tier with a Price. Tenant subscribed during provisioning. 14-day trial. Trial-to-paid conversion: Day 14 → in-app modal + email → Stripe Checkout embedded in app. On payment → features fully enabled |
| M8-2 | **Stripe webhook Edge Function** | Handle events: `payment_intent.succeeded`, `customer.subscription.updated`, `invoice.payment_failed`, `invoice.payment_succeeded`, `customer.subscription.deleted`. Update tenant status accordingly |
| M8-3 | **Subscription lifecycle** | Payment fails (1st) → email + grace period (7 days). Payment fails (grace end) → account suspended → features disabled → "payment required" screen. Payment updated → reactivated immediately. Upgrade → prorate. Downgrade → next billing cycle. Cancel → end of period + data export offer |
| M8-4 | **Billing portal** | Stripe Customer Portal integration. Owner can: update payment method, view invoices, upgrade/downgrade, cancel (with exit survey), update billing email |
| M8-5 | **Dunning email sequence** | Automated: Day 1 (failure notice), Day 3 (reminder), Day 7 (final warning with suspension notice). Links to billing portal |
| M8-6 | **Trial email sequence** | Scheduled: Day 7 (tips + upgrade offer), Day 12 (urgency), Day 14 (trial expired + Stripe Checkout link) |
| M8-7 | **Security audit** | Review all RLS policies (test cross-tenant access attempts). Verify `service_role` key is never exposed to client. Verify storage paths are tenant-scoped. Test auth edge cases (deactivated user login, expired token). DOMPurify on all user-generated content. Check for XSS, SQL injection, CSRF |
| M8-8 | **Rate limiting** | Add rate limiting on all Edge Functions. Prevent abuse/DDoS |
| M8-9 | **PWA setup** | Service worker for offline web access. `manifest.json` (icons, theme colors, display mode). Offline fallback page. Queued write sync |

#### Key Deliverables
- [ ] 14-day trial → Stripe Checkout → paid subscription works end-to-end
- [ ] Failed payment triggers dunning sequence → account suspended after grace period
- [ ] Owner can manage billing via Stripe Customer Portal
- [ ] Security audit: no cross-tenant data access possible
- [ ] PWA installable on all devices

#### Dependencies
- M7 (admin panel for billing settings)
- Stripe API keys configured
- Stripe Products/Prices created in dashboard

---

### M9 — QA & Launch (Week 10)

**Purpose:** Full end-to-end testing, deployment to production, and go-live readiness.

#### Major Tasks

| # | Task | Details |
|---|------|---------|
| M9-1 | **End-to-end workflow test** | Lead import → Telefonista call → appointment set → Rufero inspection → photos + damage form → signature → signed contract → admin sees completed deal. Test with 2 separate tenants to verify isolation |
| M9-2 | **Multi-tenant isolation test** | Create Tenant A and Tenant B. User from A must get 0 results when querying B's data. Test: prospects, appointments, documents, call logs, storage files. Test via both web and mobile |
| M9-3 | **Mobile app store prep** | Apple: App Store Connect account, certificates, provisioning profiles, privacy policy URL, permission strings, TestFlight beta upload. Android: Play Console account, app signing, Data Safety form, internal testing track |
| M9-4 | **Performance testing** | FCP < 1.5s (4G), TTI < 3.0s, dashboard load < 500ms (50 prospects), Lighthouse 90+ all metrics. Mobile: launch to usable < 2.5s |
| M9-5 | **Production deployment** | Vercel production environment for web. Supabase production project (separate from dev). All env vars in Vercel + GitHub Secrets. Supabase migrations pushed to prod. Edge Functions deployed |
| M9-6 | **Staging environment** | Separate Supabase project for staging. Anonymized test data. Pre-production QA environment |
| M9-7 | **Offline mobile testing** | Enable airplane mode during inspection flow. Photos + status updates + signature queued. Re-enable → all data synced correctly |
| M9-8 | **Edge case testing** | Duplicate prospect import, concurrent edits (last-write-wins), 10k record CSV import, photo upload retry, Telnyx mid-call disconnect, Stripe double webhook, deactivated user login attempt |
| M9-9 | **Documentation** | API documentation, deployment guide, environment setup guide, user-facing help center content |
| M9-10 | **Go-live checklist** | Custom domain configured. SSL verified. Monitoring/alerting set up. Backup schedule confirmed. Support channel ready |

#### Key Deliverables
- [ ] Full end-to-end workflow tested with 2 tenants
- [ ] No cross-tenant data leakage possible
- [ ] Mobile app submitted to TestFlight + Play internal testing
- [ ] Performance targets met
- [ ] Production environment deployed and accessible
- [ ] All edge cases handled gracefully

#### Dependencies
- All previous milestones complete
- Apple Developer + Google Play Console accounts set up

---

## 4. Unified Implementation Framework

### 4.1 Development Workflow

```
For each milestone:
1. Monday      → Plan: review milestone tasks, identify blockers, prioritize
2. Tue–Thu     → Build: focused development
3. Friday      → Demo: review deliverables against acceptance criteria
4. Buffer      → 10% of each week reserved for unexpected issues
```

**Per-task workflow:**
1. Read relevant SRS section(s) before writing any code
2. Create Supabase migration/types first (if DB changes needed)
3. Build server-side logic (server actions, Edge Functions)
4. Build UI components
5. Test against acceptance criteria
6. Document in `/docs`

### 4.2 Code Standards

| Standard | Rule |
|----------|------|
| **TypeScript strict mode** | `strict: true` in all tsconfigs. No `any` types |
| **Tenant isolation** | Every Supabase query must filter by `tenant_id`. RLS is the safety net, not the primary check |
| **Feature flags** | Check `tenants.features` at runtime. Never compile-time conditionals for tier gating |
| **Server-first** | Auth checks, data fetching, and mutations use Server Components and Server Actions. Client components only for interactivity |
| **No hardcoded values** | Prices, limits, and configs from `platform_config` or env vars |
| **60-record pagination** | Prospect lists always page at 60 records (Anti-Collision System requirement) |
| **DOMPurify** | All user-generated content sanitized before rendering |
| **Structured errors** | User-facing errors in plain English with suggested action. Never raw error codes |
| **Activity logging** | Every state change logged to `activities` table |

### 4.3 Documentation Standards

After completing any task, create or update a doc in `/docs/`:

```markdown
# [Stage/Task Name]
> Completed: [date]

## Purpose
What was done and why

## What Was Done
- Technical details
- Files created/modified

## Architecture Decisions
- Key choices and reasoning

## Verification
- How to confirm it works

## TODO
- Remaining items if any
```

### 4.4 Testing Strategy

| Level | What | When |
|-------|------|------|
| **Type safety** | TypeScript strict mode catches schema mismatches | Build time |
| **RLS verification** | Query as different tenant users, verify 0 cross-tenant results | After every DB migration |
| **Auth guards** | Test each route with each role — verify correct access/denial | After middleware/layout changes |
| **E2E workflows** | Full user journey: create prospect → call → appointment → inspect → sign | End of each milestone |
| **Offline resilience** | Test mobile flows with airplane mode enabled | M5, M6, M9 |
| **Performance** | Lighthouse audit, dashboard load time, API response time | M9 |
| **Security** | Cross-tenant access attempts, XSS input, expired tokens | M8, M9 |

### 4.5 Integration Strategy Between Milestones

```
M1 (Foundation) ─────────────────────────────────┐
  │                                                │
  ├── M2 (Prospects + Dashboard) ───┐              │
  │                                 │              │
  │   M3 (Maps + Profile Polish) ───┤              │
  │                                 │              │
  │   M4 (Communication) ──────────┤              │
  │     │                           │              │
  │     M5 (Appointments + Docs) ──┤              │
  │       │                         │              │
  │       M6 (Mobile Offline) ─────┤              │
  │                                 │              │
  │   M7 (Admin + Analytics) ──────┘              │
  │     │                                          │
  │     M8 (Billing + Security) ──────────────────┘
  │       │
  └───── M9 (QA & Launch)
```

**Key integration points:**
- M2 builds the component library (DataTable, StatusBadge, etc.) that all subsequent milestones reuse
- M4's notification system is used by M5 (appointment reminders), M6 (push notifications)
- M5's PDF generation is used by M7 (onboarding step: "generate your first contract")
- M7's admin panel requires M4 (calling hours config) and M5 (document templates)
- M8 requires everything to be functional before security audit

### 4.6 Preventing Scope Drift

| Risk | Prevention |
|------|-----------|
| Adding Tier 2-5 features during Tier 1 build | Only build features where `features.crmCore: true`. Create stubs for higher tiers (return "Not available on your plan") |
| Over-engineering early milestones | Build the simplest working version first. Polish in later milestones |
| Skipping multi-tenancy checks | Every PR must include: "Does this query filter by tenant_id?" |
| Gold-plating UI | Use shadcn/ui defaults. No custom animations until M9 |
| Ignoring mobile | Every milestone (M2-M8) has explicit mobile tasks. Don't defer all mobile to M6 |
| Deviating from SRS data models | The SRS defines exact field names and types. Database schema must match. Don't rename fields "because it sounds better" |

### 4.7 Assumptions

1. **Supabase replaces Firebase** — The SRS references Firebase/Firestore throughout. The actual implementation uses Supabase. All concepts translate: Firestore Security Rules → RLS, Cloud Functions → Edge Functions, Firebase Auth → Supabase Auth
2. **Flutter replaces React Native** — SRS Section 12 specifies React Native. Actual implementation uses Flutter with DDD + BLoC
3. **API keys available** — Third-party API keys (Telnyx, SendGrid, Stripe, Google Maps) must be provided before Week 1 ends (per Project Plan Section 7)
4. **Single developer** — The project plan implies a single developer using AI-assisted tools (Claude Code, Claude Sonnet). Task sizing reflects this
5. **Anti-Collision System** — SRS Section 30 defines a display rotation system for prospects. The 60-record page limit and rotating display order are required for the prospect list
