# roof-aid-crm
-- second edition
# Roof-Aid CRM — Week 1 (M1) Implementation Plan

## Context

Building Roof-Aid CRM: a multi-tenant vertical SaaS for roofing companies.
Tech stack update from spec: **Firebase → Supabase**, **React Native → Flutter (DDD)**.
Everything else from the v4.0 spec stays the same.

**M1 Acceptance Criteria (Weeks 1–2, Days 1–5 focus):**
- Monorepo scaffolded, runs locally
- Supabase live: all Tier 1 tables + RLS policies complete
- Next.js 15 web app boots locally
- Flutter app boots locally
- Tenant provisioning (Edge Function) works end-to-end
- All secrets configured

---

## Part 1 — Monorepo Structure

```
roof-aid-crm/
├── apps/
│   ├── web/                    # Next.js 15 (App Router, TS, Tailwind)
│   └── mobile/                 # Flutter (DDD architecture)
├── packages/
│   └── types/                  # Shared TypeScript types (used by web + edge functions)
├── supabase/
│   ├── migrations/             # Versioned SQL migrations (001_init.sql, etc.)
│   ├── functions/              # Supabase Edge Functions (Deno/TypeScript)
│   │   ├── provision-tenant/
│   │   ├── generate-pdf/
│   │   └── telnyx-webhook/
│   └── seed/                   # Dev seed data
├── .github/
│   └── workflows/
│       ├── web-deploy.yml
│       └── mobile-build.yml
├── .env.example
├── package.json                # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Tooling: **pnpm workspaces + Turborepo** for the JS monorepo. Flutter lives inside `apps/mobile` as a standalone Flutter project (its own `pubspec.yaml`).

---

## Part 2 — Supabase Table Design

### 2.1 Core Tables (18 tables total for Tier 1)

#### `tenants`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| name | text NOT NULL | Company name |
| slug | text UNIQUE NOT NULL | subdomain: storm-pro → storm-pro.roofaid.app |
| plan_tier | smallint DEFAULT 1 | 1–5 |
| billing_cycle | text DEFAULT 'monthly' | 'monthly' / 'annual' |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| trial_expires_at | timestamptz | |
| is_active | boolean DEFAULT true | |
| is_suspended | boolean DEFAULT false | |
| features | jsonb DEFAULT '{}' | Feature flags (see below) |
| settings | jsonb DEFAULT '{}' | Branding, timezone, calling hours |
| telnyx_app_id | text | Call Control Application ID |
| telnyx_main_number | text | E.164 format |
| sendgrid_subuser | text | Per-tenant SendGrid subuser |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() |

**Features JSONB default for Tier 1:**
```json
{
  "crmCore": true,
  "humanCalling": true,
  "mobileApp": true,
  "leads": false,
  "aiCaller": false,
  "supplements": false,
  "supplementCommission": false,
  "computerVision": false,
  "advancedAnalytics": false,
  "apiAccess": false,
  "whiteLabel": false
}
```

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | matches auth.users.id |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| role | text NOT NULL | 'super_admin' / 'owner' / 'admin' / 'telefonista' / 'rufero' |
| first_name | text | |
| last_name | text | |
| email | text NOT NULL | |
| phone | text | |
| telnyx_extension | text | Personal extension |
| sendgrid_sender | text | Personal email sender |
| home_base_address | text | For Rufero distance calculation |
| home_base_coords | point | PostGIS point |
| fcm_token | text | Push notification token |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

#### `prospects`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | Partition key — on every query |
| name | text NOT NULL | |
| address | text | |
| city | text | |
| state | text | |
| zip | text | |
| coordinates | point | PostGIS (lat, lng) |
| geohash | text | For proximity search |
| phones | text[] | Multiple phone numbers |
| email | text | |
| home_value | numeric | USD |
| hail_size | numeric | inches |
| status | text DEFAULT 'new_leads' | Pipeline status enum |
| tipo | text | Record type label |
| source | text | 'manual' / 'csv-import' / 'storm-import' / 'api' |
| assigned_to | uuid REFERENCES users | Rufero |
| assigned_by | uuid REFERENCES users | |
| assigned_at | timestamptz | |
| do_not_call | boolean DEFAULT false | DNC flag |
| do_not_call_reason | text | |
| do_not_call_at | timestamptz | |
| tags | text[] | |
| created_by | uuid REFERENCES users | |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

**Index:** `(tenant_id, status)`, `(tenant_id, city)`, `(tenant_id, assigned_to)`, GiST on `coordinates`

#### `appointments`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects NOT NULL | |
| rufero_id | uuid REFERENCES users NOT NULL | |
| created_by | uuid REFERENCES users | |
| scheduled_at | timestamptz NOT NULL | |
| duration_minutes | int DEFAULT 60 | |
| status | text DEFAULT 'pending' | pending/confirmed/completed/cancelled/no-show/rescheduled |
| notes | text | |
| cancellation_reason | text | |
| rescheduled_from | uuid REFERENCES appointments | |
| reminder_24h_sent | boolean DEFAULT false | |
| reminder_2h_sent | boolean DEFAULT false | |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

#### `documents`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects NOT NULL | |
| type | text NOT NULL | '3rd_party_auth' / 'acv_contract' / 'rcv_contract' / 'supplement' |
| status | text DEFAULT 'generated' | 'generated' / 'sent' / 'signed' |
| storage_path | text | Supabase Storage path |
| signed_storage_path | text | Signed version |
| signed_at | timestamptz | |
| signed_by | uuid REFERENCES users | |
| signature_url | text | |
| created_by | uuid REFERENCES users | |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

#### `call_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects | |
| agent_id | uuid REFERENCES users | |
| direction | text NOT NULL | 'inbound' / 'outbound' |
| from_number | text | |
| to_number | text | |
| duration_seconds | int | |
| disposition | text | 'answered' / 'no_answer' / 'voicemail' / 'wrong_number' / 'dnc_request' / 'callback_requested' |
| recording_url | text | |
| telnyx_call_id | text | |
| source | text DEFAULT 'human' | 'human' / 'ai-agent' |
| created_at | timestamptz DEFAULT now() |

#### `sms_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects | |
| agent_id | uuid REFERENCES users | |
| direction | text NOT NULL | 'inbound' / 'outbound' |
| from_number | text | |
| to_number | text | |
| body | text | |
| status | text | 'sent' / 'delivered' / 'failed' |
| telnyx_message_id | text | |
| created_at | timestamptz DEFAULT now() |

#### `email_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects | |
| agent_id | uuid REFERENCES users | |
| direction | text NOT NULL | 'inbound' / 'outbound' |
| subject | text | |
| body | text | |
| status | text | 'sent' / 'delivered' / 'bounced' / 'failed' |
| sendgrid_message_id | text | |
| created_at | timestamptz DEFAULT now() |

#### `activities` (audit log)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects | |
| user_id | uuid REFERENCES users | |
| type | text NOT NULL | 'status_change' / 'note_added' / 'call' / 'sms' / 'email' / 'appointment' / 'document' / 'assignment' / 'dnc' |
| metadata | jsonb | Flexible payload per type |
| created_at | timestamptz DEFAULT now() |

#### `notes`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects NOT NULL | |
| author_id | uuid REFERENCES users NOT NULL | |
| body | text NOT NULL | |
| created_at | timestamptz DEFAULT now() |

#### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| user_id | uuid REFERENCES users NOT NULL | |
| type | text | 'appointment_assigned' / 'document_signed' / 'inbound_call' / 'inbound_sms' / 'lead_assigned' / 'system_alert' |
| title | text | |
| body | text | |
| related_id | uuid | Reference to related record |
| related_type | text | 'prospect' / 'appointment' / 'document' |
| is_read | boolean DEFAULT false | |
| created_at | timestamptz DEFAULT now() |

#### `platform_config`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| key | text UNIQUE NOT NULL | e.g. 'tier_1_monthly_price' |
| value | jsonb NOT NULL | |
| updated_by | uuid REFERENCES users | |
| updated_at | timestamptz DEFAULT now() |

#### `supplements` (Tier 1 schema, feature-flagged)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects NOT NULL | |
| document_id | uuid REFERENCES documents | |
| claim_value | numeric | USD |
| commission_amount | numeric | claim_value × 0.10 |
| status | text DEFAULT 'draft' | 'draft' / 'submitted' / 'approved' / 'denied' |
| created_by | uuid REFERENCES users | |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

#### `commission_transactions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| supplement_id | uuid REFERENCES supplements NOT NULL | |
| claim_value | numeric | |
| commission_amount | numeric | |
| status | text DEFAULT 'pending' | 'pending' / 'billed' / 'paid' / 'disputed' |
| stripe_invoice_id | text | |
| disputed_at | timestamptz | |
| dispute_reason | text | |
| resolved_at | timestamptz | |
| created_at | timestamptz DEFAULT now() |

#### `inspection_reports` (Rufero mobile)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid REFERENCES tenants NOT NULL | |
| prospect_id | uuid REFERENCES prospects NOT NULL | |
| appointment_id | uuid REFERENCES appointments | |
| rufero_id | uuid REFERENCES users NOT NULL | |
| damage_data | jsonb | Structured damage form |
| photo_urls | text[] | Supabase Storage paths |
| ai_analysis | jsonb | Tier 5 — null for now |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

### 2.2 Supabase Storage Buckets
- `documents` — PDF files (`{tenant_id}/documents/{prospect_id}/{doc_id}.pdf`)
- `call-recordings` — audio (`{tenant_id}/call-recordings/{call_id}.mp3`)
- `inspection-photos` — images (`{tenant_id}/inspections/{report_id}/{filename}`)

All buckets: **private**, accessed via signed URLs (1h expiry), RLS enforced at bucket level.

---

## Part 3 — RLS Policies

### Pattern
Every table that has `tenant_id` gets this fundamental rule:
```sql
-- Helper function (created once)
CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'role';
$$ LANGUAGE sql STABLE;
```

### Key Policies by Table

**`tenants`**
- SELECT: own tenant only (`id = auth.tenant_id()`) OR super_admin
- INSERT/UPDATE/DELETE: super_admin only

**`users`**
- SELECT: same tenant (`tenant_id = auth.tenant_id()`) OR super_admin
- INSERT: owner or super_admin
- UPDATE: own record OR admin/owner/super_admin
- DELETE: owner or super_admin

**`prospects`**
- SELECT: same tenant; Rufero restricted to `assigned_to = auth.uid()`
- INSERT/UPDATE: telefonista, admin, owner (same tenant)
- DELETE: admin, owner (same tenant)

**`appointments`**
- SELECT: same tenant; Rufero sees only `rufero_id = auth.uid()`
- INSERT/UPDATE: telefonista+ (same tenant)
- DELETE: admin+

**`documents`**
- SELECT: same tenant, all roles
- INSERT/UPDATE: telefonista+, Rufero for their own
- DELETE: admin+

**`call_logs`, `sms_logs`, `email_logs`**
- SELECT: same tenant, all roles; Rufero sees none (web-only feature)
- INSERT: any authenticated user of same tenant
- DELETE: none

**`activities`**
- SELECT: same tenant; Rufero sees none
- INSERT: system/edge functions only (service role)
- UPDATE/DELETE: none

**`notifications`**
- SELECT: `user_id = auth.uid()`
- INSERT: service role only
- UPDATE (mark read): `user_id = auth.uid()`

**`platform_config`**
- SELECT/INSERT/UPDATE/DELETE: super_admin only

**`commission_transactions`**
- SELECT/INSERT/UPDATE: super_admin only

---

## Part 4 — Flutter App Structure (DDD)

```
apps/mobile/
├── lib/
│   ├── core/
│   │   ├── config/
│   │   │   └── supabase_config.dart
│   │   ├── di/
│   │   │   └── injection_container.dart    # get_it setup
│   │   ├── error/
│   │   │   ├── exceptions.dart
│   │   │   └── failures.dart
│   │   ├── network/
│   │   │   └── network_info.dart
│   │   └── utils/
│   │       ├── constants.dart
│   │       └── extensions.dart
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/
│   │   │   │   ├── datasources/
│   │   │   │   │   └── auth_remote_datasource.dart
│   │   │   │   ├── models/
│   │   │   │   │   └── user_model.dart
│   │   │   │   └── repositories/
│   │   │   │       └── auth_repository_impl.dart
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   └── user_entity.dart
│   │   │   │   ├── repositories/
│   │   │   │   │   └── auth_repository.dart   # abstract
│   │   │   │   └── usecases/
│   │   │   │       ├── sign_in.dart
│   │   │   │       └── sign_out.dart
│   │   │   └── presentation/
│   │   │       ├── bloc/
│   │   │       │   ├── auth_bloc.dart
│   │   │       │   ├── auth_event.dart
│   │   │       │   └── auth_state.dart
│   │   │       ├── pages/
│   │   │       │   └── login_page.dart
│   │   │       └── widgets/
│   │   ├── prospects/          # same pattern: data/domain/presentation
│   │   ├── appointments/
│   │   ├── documents/
│   │   ├── inspection/
│   │   └── notifications/
│   ├── app.dart
│   └── main.dart
├── pubspec.yaml
├── analysis_options.yaml
└── android/ ios/ web/
```

**Key packages:**
- `supabase_flutter` — auth + DB + realtime + storage
- `flutter_bloc` — state management
- `get_it` + `injectable` — dependency injection
- `dartz` — functional error handling (Either)
- `connectivity_plus` — offline detection
- `hive` or `drift` — local SQLite for offline queue
- `go_router` — navigation
- `google_maps_flutter` — maps
- `camera` / `image_picker` — inspection photos
- `signature` — e-signature pad
- `pdf` — PDF preview

---

## Part 5 — Next.js Web App Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Sidebar + nav shell
│   │   ├── page.tsx               # Main CRM dashboard
│   │   ├── prospects/
│   │   │   └── [id]/page.tsx
│   │   ├── appointments/
│   │   ├── documents/
│   │   ├── communications/
│   │   └── admin/
│   │       ├── users/
│   │       ├── analytics/
│   │       └── settings/
│   ├── super-admin/               # Platform admin, separate layout
│   ├── onboarding/
│   ├── layout.tsx                 # Root layout
│   └── globals.css
├── components/
│   ├── ui/                        # shadcn/ui components
│   ├── prospects/
│   ├── maps/
│   └── softphone/
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Browser client
│   │   └── server.ts              # Server client (RSC)
│   ├── hooks/
│   └── utils/
├── public/
│   ├── manifest.json              # PWA
│   └── sw.js                      # Service worker
├── middleware.ts                  # Auth guard + tenant resolution
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

**Key packages:** `@supabase/ssr`, `@supabase/supabase-js`, `shadcn/ui`, `@tanstack/react-query`, `zustand`, `react-hook-form` + `zod`, `@telnyx/webrtc`

---

## Part 6 — Supabase Edge Functions (Week 1 scope)

### `provision-tenant/index.ts`
Called when a new tenant is created by Super Admin or self-signup.
Steps:
1. Insert row into `tenants` table
2. Create Supabase Auth user for Owner
3. Insert into `users` with role=`owner`
4. Create Stripe customer
5. Start 14-day trial (set `trial_expires_at`)
6. Provision Telnyx number (async, best-effort)
7. Create SendGrid subuser (async, best-effort)
8. Return tenant ID + owner temp password

Target: sync portion < 30s, full provisioning < 2 min.

---

## Part 7 — Week 1 Day-by-Day Tasks

| Day | Tasks |
|-----|-------|
| **Day 1** | Create monorepo scaffold (pnpm + turbo). Init Next.js 15 app. Init Flutter app. Set up `.env.example`. Create Supabase project (staging). |
| **Day 2** | Write all SQL migrations (`001_init.sql` through `005_rls.sql`). Enable PostGIS. Create helper functions. Apply to Supabase. |
| **Day 3** | Write all RLS policies. Verify in Supabase SQL editor. Configure Storage buckets + policies. |
| **Day 4** | Build `provision-tenant` Edge Function. Wire up Stripe customer creation. Test end-to-end tenant creation. |
| **Day 5** | Connect Next.js to Supabase (auth middleware + SSR client). Connect Flutter to Supabase. Login flow working on both. Demo: both apps boot, login works, tenant provisioning creates a real tenant. |

---

## Part 8 — Secrets to Configure (`.env.example`)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Telnyx
TELNYX_API_KEY=
TELNYX_APP_ID=

# SendGrid
SENDGRID_API_KEY=

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Flutter equivalents stored in `--dart-define` or `flutter_dotenv`.

---

## Verification Checklist (M1 Done When)

- [ ] `pnpm dev` starts Next.js at localhost:3000 without errors
- [ ] Flutter `flutter run` boots on Android/iOS simulator
- [ ] Supabase dashboard shows all 15 tables created
- [ ] RLS policy test: user from Tenant A cannot read Tenant B's prospects
- [ ] Super Admin can create a new tenant via Edge Function call
- [ ] New tenant owner can log in on the web app
- [ ] New tenant owner can log in on the Flutter app
- [ ] Storage buckets exist with correct private config
- [ ] `.env.example` documents all required secrets
