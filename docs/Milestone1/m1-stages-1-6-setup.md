# M1 Stages 1–6 Setup Documentation

## Date: 2026-04-08

## Purpose
Bootstrap the Roof-Aid CRM monorepo with all foundational infrastructure: project scaffold, web app, mobile app, database schema, security policies, and tenant provisioning.

---

## Stage 1 — Monorepo Scaffold
- Initialized pnpm workspace at `~/Desktop/Projects/work/CMS/roof-aid-crm`
- Created `pnpm-workspace.yaml` with `apps/*` and `packages/*`
- Installed turbo, prettier, typescript as root devDependencies
- Created `turbo.json` with build/dev/lint/test pipeline
- Created `.env.example` with all 10 required secrets documented
- Created `.gitignore` covering node_modules, .next, .turbo, .env, Flutter artifacts
- Created folder structure: `apps/`, `packages/types/src/`, `supabase/`, `.github/workflows/`

## Stage 2 — Next.js Web App
- Scaffolded with `create-next-app` (TypeScript, Tailwind, App Router)
- Package renamed to `@roof-aid/web`
- Installed: @supabase/supabase-js, @supabase/ssr, @tanstack/react-query, zustand, react-hook-form, zod, shadcn/ui, lucide-react
- Created route structure:
  - `(auth)/login` — login page
  - `(dashboard)/` — main dashboard with prospects, appointments, documents, communications, admin
  - `super-admin/` — platform admin
  - `onboarding/` — tenant onboarding
- Created `lib/supabase/`, `lib/hooks/`, `lib/utils/`, `components/` directories
- `.env.local` configured with Supabase credentials

## Stage 3 — Flutter Mobile App
- Scaffolded with `flutter create` (org: com.roofaid, platforms: android, ios)
- Added packages: supabase_flutter, flutter_bloc, get_it, injectable, dartz, go_router, connectivity_plus, hive_flutter, google_maps_flutter, image_picker, flutter_dotenv
- Created DDD folder structure under `lib/`:
  - `core/` — config, di, error, network, utils
  - `features/` — auth, prospects, appointments, documents, inspection, notifications (each with data/domain/presentation layers)
- Created core files: SupabaseConfig, injection container, exceptions, failures, network info, constants
- Created `main.dart` with Supabase initialization and `app.dart` with GoRouter

## Stage 4 — Supabase DB Migrations
- **001_extensions.sql** — uuid-ossp, PostGIS, pg_trgm
- **002_core_tables.sql** — All 15 tables:
  1. tenants, 2. users, 3. prospects, 4. appointments, 5. documents
  6. call_logs, 7. sms_logs, 8. email_logs, 9. activities, 10. notes
  11. notifications, 12. platform_config, 13. supplements, 14. commission_transactions, 15. inspection_reports
- **003_indexes.sql** — Composite indexes + GiST spatial index on prospects.coordinates
- **004_helper_functions.sql** — `set_updated_at()` trigger function
- **004b_auth_functions** — `public.get_tenant_id()` and `public.get_user_role()` (created in public schema due to auth schema permissions)
- **005_triggers.sql** — Auto-update `updated_at` on 7 tables

### Important Note
- `auth.tenant_id()` / `auth.user_role()` could not be created in the `auth` schema (permission denied). Replaced with `public.get_tenant_id()` and `public.get_user_role()` using `SECURITY DEFINER`.

## Stage 5 — RLS Policies + Storage
- **006_rls.sql** — Row-level security enabled on all 15 tables
- Key policies:
  - Tenants: own row or super_admin
  - Users: same tenant, management by admin+
  - Prospects: rufero sees only assigned records
  - Appointments: rufero sees only own
  - Activities: read by admin+, insert by service role
  - Notifications: user sees only their own
  - Platform config + commissions: super_admin only
- Storage buckets created via dashboard: documents, call-recordings, inspection-photos (all private)

## Stage 6 — provision-tenant Edge Function
- Created `supabase/functions/provision-tenant/index.ts`
- Functionality:
  1. Validates input (name, slug, ownerEmail)
  2. Inserts tenant with 14-day trial
  3. Creates auth user with owner role + tenant_id in metadata
  4. Inserts user record
  5. Creates Stripe customer (non-fatal if no key)
  6. Full rollback on failure at any step
- Returns: tenant_id, owner_id, temp_password, trial_expires_at, stripe_customer_id
- Deno config created at `supabase/functions/deno.json` for IDE support

---

## Remaining (Stages 7–8)
- Stage 7: Auth integration (web + mobile login)
- Stage 8: CI/CD wiring (Vercel + GitHub Actions)

## Supabase Project
- Project ref: `ivmfmpscdimyepbvrbee`
- Region: eu-west-1
