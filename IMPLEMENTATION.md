# Roof-Aid CRM — M1 Implementation Guide (Week 1)

> **How to use this file:** Work through each stage in order. Each stage has clear steps, commands, and a verification checkpoint before moving on. Ask Claude for help implementing any individual step.

---

## Overview

| Stage | Day | Goal | Deploy Impact |
|-------|-----|------|---------------|
| 1 | 1 | Monorepo scaffold | Sets up Vercel + GitHub Actions wiring |
| 2 | 1 | Next.js web app | Web app boots locally |
| 3 | 1 | Flutter mobile app | Mobile app boots on simulator |
| 4 | 2 | Supabase DB migrations | 15 tables + indexes live |
| 5 | 3 | RLS + Storage | Multi-tenancy enforced |
| 6 | 4 | provision-tenant Edge Function | Tenant creation works end-to-end |
| 7 | 5 | Auth integration | Login works on web + mobile |
| 8 | 5 | CI/CD wiring | Automated deploy on push |

---

## Stage 1 — Monorepo Root

**Goal:** A working pnpm + Turborepo monorepo that Vercel and GitHub Actions can consume.

### Steps

1. Create the project folder and initialize pnpm:
   ```bash
   mkdir roof-aid-crm && cd roof-aid-crm
   pnpm init
   pnpm pkg set private=true
   pnpm pkg set scripts.dev="turbo run dev"
   pnpm pkg set scripts.build="turbo run build"
   pnpm pkg set scripts.lint="turbo run lint"
   pnpm pkg set scripts.test="turbo run test"
   ```

2. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```

3. Install root tooling:
   ```bash
   pnpm add -Dw turbo prettier typescript
   ```

4. Create `turbo.json`:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "ui": "tui",
     "tasks": {
       "build": {
         "dependsOn": ["^build"],
         "inputs": ["$TURBO_DEFAULT$", ".env*"],
         "outputs": [".next/**", "!.next/cache/**", "dist/**"]
       },
       "dev":   { "cache": false, "persistent": true },
       "lint":  { "dependsOn": ["^lint"] },
       "test":  { "dependsOn": ["^build"] }
     }
   }
   ```

5. Create `.env.example` (commit this, never commit `.env`):
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

6. Create `.gitignore` (include `node_modules`, `.next`, `.turbo`, `.env`, Flutter build artifacts).

7. Create folder structure:
   ```bash
   mkdir -p apps packages/types/src supabase/migrations supabase/functions/provision-tenant supabase/functions/generate-pdf supabase/functions/telnyx-webhook supabase/seed .github/workflows
   ```

### ✅ Checkpoint
- `pnpm install` runs without errors at repo root
- `ls apps packages supabase` shows all three folders

---

## Stage 2 — Next.js Web App

**Goal:** Web app scaffolded, boots locally, ready for Vercel deployment.

### Steps

1. Scaffold with `create-next-app` (this generates tsconfig, tailwind config, etc. automatically):
   ```bash
   cd apps
   npx create-next-app@latest web \
     --typescript \
     --tailwind \
     --app \
     --no-src-dir \
     --import-alias "@/*" \
     --no-eslint \
     --use-pnpm
   ```

2. Rename the package for the monorepo:
   ```bash
   cd web
   pnpm pkg set name="@roof-aid/web"
   ```

3. Install Supabase + app packages:
   ```bash
   pnpm add @supabase/supabase-js @supabase/ssr
   pnpm add @tanstack/react-query zustand
   pnpm add react-hook-form zod @hookform/resolvers
   pnpm add class-variance-authority clsx tailwind-merge lucide-react
   ```

4. Install shadcn/ui (run from `apps/web`):
   ```bash
   npx shadcn@latest init
   ```
   Choose: TypeScript ✓, App Router ✓, Tailwind CSS ✓, `@/*` alias.

5. Create the folder structure inside `apps/web/`:
   ```
   app/
   ├── (auth)/
   │   └── login/page.tsx
   ├── (dashboard)/
   │   ├── layout.tsx
   │   ├── page.tsx
   │   ├── prospects/[id]/page.tsx
   │   ├── appointments/page.tsx
   │   ├── documents/page.tsx
   │   ├── communications/page.tsx
   │   └── admin/
   │       ├── users/page.tsx
   │       ├── analytics/page.tsx
   │       └── settings/page.tsx
   ├── super-admin/page.tsx
   ├── onboarding/page.tsx
   ├── layout.tsx
   └── globals.css
   lib/
   ├── supabase/
   │   ├── client.ts      ← browser Supabase client
   │   └── server.ts      ← RSC / server action Supabase client
   ├── hooks/
   └── utils/
   components/
   ├── ui/                ← shadcn generated components go here
   ├── prospects/
   ├── maps/
   └── softphone/
   middleware.ts
   ```

6. Create `apps/web/.env.local` (copy from root `.env.example`, fill in your Supabase values).

### ⚠️ Deployment Notes (Vercel)
- In Vercel project settings → **Root Directory**: set to `apps/web`
- Or use Vercel's monorepo detection with the Turborepo preset (recommended)
- Vercel env vars: add all `NEXT_PUBLIC_*` and server-side vars in the Vercel dashboard
- `SUPABASE_SERVICE_ROLE_KEY` must be a **server-only** secret — never prefix with `NEXT_PUBLIC_`

### ✅ Checkpoint
- `cd apps/web && pnpm dev` → app at `localhost:3000` with Next.js default page
- `pnpm build` completes without errors

---

## Stage 3 — Flutter Mobile App

**Goal:** Flutter app scaffolded with DDD structure, boots on Android/iOS simulator.

### Steps

1. Install Flutter (if not installed):
   ```bash
   sudo snap install flutter --classic
   # or download from https://docs.flutter.dev/get-started/install
   flutter doctor   # fix any issues shown
   ```

2. Scaffold the app:
   ```bash
   cd /path/to/roof-aid-crm/apps
   flutter create mobile \
     --org com.roofaid \
     --project-name roof_aid_crm \
     --platforms android,ios
   ```

3. Add packages to `apps/mobile/pubspec.yaml` under `dependencies:`:
   ```yaml
   dependencies:
     flutter:
       sdk: flutter
     supabase_flutter: ^2.0.0
     flutter_bloc: ^8.1.0
     get_it: ^7.6.0
     injectable: ^2.3.2
     dartz: ^0.10.1
     go_router: ^13.0.0
     connectivity_plus: ^6.0.0
     hive_flutter: ^1.1.0
     google_maps_flutter: ^2.9.0
     image_picker: ^1.1.0
     flutter_dotenv: ^5.2.1

   dev_dependencies:
     flutter_test:
       sdk: flutter
     injectable_generator: ^2.4.1
     build_runner: ^2.4.0
     flutter_lints: ^4.0.0
   ```

4. Run `flutter pub get`.

5. Build the DDD folder structure inside `apps/mobile/lib/`:
   ```
   lib/
   ├── core/
   │   ├── config/supabase_config.dart
   │   ├── di/injection_container.dart
   │   ├── error/exceptions.dart
   │   ├── error/failures.dart
   │   ├── network/network_info.dart
   │   └── utils/constants.dart
   ├── features/
   │   ├── auth/
   │   │   ├── data/
   │   │   │   ├── datasources/auth_remote_datasource.dart
   │   │   │   ├── models/user_model.dart
   │   │   │   └── repositories/auth_repository_impl.dart
   │   │   ├── domain/
   │   │   │   ├── entities/user_entity.dart
   │   │   │   ├── repositories/auth_repository.dart
   │   │   │   └── usecases/sign_in.dart
   │   │   └── presentation/
   │   │       ├── bloc/auth_bloc.dart
   │   │       ├── bloc/auth_event.dart
   │   │       ├── bloc/auth_state.dart
   │   │       └── pages/login_page.dart
   │   ├── prospects/       ← same data/domain/presentation pattern
   │   ├── appointments/
   │   ├── documents/
   │   ├── inspection/
   │   └── notifications/
   ├── app.dart
   └── main.dart
   ```

6. Add a `.env` file at `apps/mobile/assets/.env` (gitignored) and register it in pubspec:
   ```yaml
   flutter:
     assets:
       - assets/.env
   ```

### ⚠️ Build Notes (CI/CD)
- Android APK: `flutter build apk --release --dart-define-from-file=.env`
- iOS IPA: `flutter build ipa --release --dart-define-from-file=.env` (requires macOS runner)
- GitHub Actions: use `subosito/flutter-action@v2` in `.github/workflows/mobile-build.yml`

### ✅ Checkpoint
- `cd apps/mobile && flutter run` → app boots on connected device/simulator
- `flutter analyze` shows no errors

---

## Stage 4 — Supabase DB Migrations

**Goal:** All 15 Tier 1 tables created in Supabase with correct indexes.

### Prerequisites
```bash
npm install -g supabase   # or: brew install supabase/tap/supabase
supabase login
supabase init             # run from repo root — generates supabase/config.toml
supabase link --project-ref <your-project-ref>
```

### Migration Files

Create these files in `supabase/migrations/` in order:

#### `001_extensions.sql`
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for text search later
```

#### `002_core_tables.sql`
Create tables in FK dependency order:
1. `tenants` — with `features` JSONB default (all Tier 1 flags)
2. `users` — `id` matches `auth.users.id`, `home_base_coords point`
3. `prospects` — `coordinates point`, `phones text[]`
4. `appointments` — self-ref FK `rescheduled_from uuid REFERENCES appointments`
5. `documents`
6. `call_logs`, `sms_logs`, `email_logs`
7. `activities`
8. `notes`
9. `notifications`
10. `platform_config`
11. `supplements`
12. `commission_transactions`
13. `inspection_reports`

> See the full column list for each table in the spec above this file.

#### `003_indexes.sql`
```sql
CREATE INDEX idx_prospects_tenant_status   ON prospects(tenant_id, status);
CREATE INDEX idx_prospects_tenant_city     ON prospects(tenant_id, city);
CREATE INDEX idx_prospects_tenant_assignee ON prospects(tenant_id, assigned_to);
CREATE INDEX idx_prospects_coords          ON prospects USING GIST(coordinates);
CREATE INDEX idx_appts_tenant_rufero       ON appointments(tenant_id, rufero_id);
CREATE INDEX idx_appts_scheduled           ON appointments(tenant_id, scheduled_at);
CREATE INDEX idx_notifs_user               ON notifications(user_id, is_read);
CREATE INDEX idx_activities_prospect       ON activities(tenant_id, prospect_id);
CREATE INDEX idx_call_logs_tenant          ON call_logs(tenant_id, created_at DESC);
```

#### `004_helper_functions.sql`
```sql
-- Read tenant_id from JWT claims
CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Read role from JWT claims
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'role';
$$ LANGUAGE sql STABLE;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### `005_triggers.sql`
```sql
-- Attach set_updated_at() to every table with an updated_at column
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Repeat for: users, prospects, appointments, documents, supplements, inspection_reports
```

### Apply Migrations
```bash
supabase db push          # pushes all pending migrations to linked project
# or for local dev:
supabase start            # starts local Supabase stack via Docker
supabase db reset         # resets local DB and re-runs all migrations
```

### ✅ Checkpoint
- Supabase dashboard → Table Editor shows all 15 tables
- PostGIS: run `SELECT PostGIS_Version();` in SQL editor — should return version string
- Run `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'auth';` — shows `tenant_id` and `user_role`

---

## Stage 5 — RLS Policies + Storage Buckets

**Goal:** Row-level security enforced; no cross-tenant data leakage; storage buckets private.

### `006_rls.sql`

Enable RLS and add policies for every table. Key patterns:

```sql
-- Enable on all tables
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects            ENABLE ROW LEVEL SECURITY;
-- ... repeat for all 15 tables

-- TENANTS: own row or super_admin
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (
  id = auth.tenant_id() OR auth.user_role() = 'super_admin'
);
CREATE POLICY "tenants_modify" ON tenants FOR ALL USING (
  auth.user_role() = 'super_admin'
);

-- USERS: same tenant; rufero can't see other tenants
CREATE POLICY "users_select" ON users FOR SELECT USING (
  tenant_id = auth.tenant_id() OR auth.user_role() = 'super_admin'
);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  tenant_id = auth.tenant_id() AND auth.user_role() IN ('super_admin','owner')
);
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  tenant_id = auth.tenant_id() AND (
    id = auth.uid() OR auth.user_role() IN ('admin','owner','super_admin')
  )
);
CREATE POLICY "users_delete" ON users FOR DELETE USING (
  auth.user_role() IN ('owner','super_admin')
);

-- PROSPECTS: rufero sees only assigned records
CREATE POLICY "prospects_select" ON prospects FOR SELECT USING (
  tenant_id = auth.tenant_id() AND (
    auth.user_role() IN ('owner','admin','telefonista') OR
    (auth.user_role() = 'rufero' AND assigned_to = auth.uid())
  )
);
CREATE POLICY "prospects_write" ON prospects
  FOR INSERT WITH CHECK (
    tenant_id = auth.tenant_id() AND
    auth.user_role() IN ('owner','admin','telefonista')
  );
CREATE POLICY "prospects_update" ON prospects FOR UPDATE USING (
  tenant_id = auth.tenant_id() AND
  auth.user_role() IN ('owner','admin','telefonista')
);
CREATE POLICY "prospects_delete" ON prospects FOR DELETE USING (
  tenant_id = auth.tenant_id() AND auth.user_role() IN ('owner','admin')
);

-- APPOINTMENTS: rufero sees only own appointments
CREATE POLICY "appts_select" ON appointments FOR SELECT USING (
  tenant_id = auth.tenant_id() AND (
    auth.user_role() IN ('owner','admin','telefonista') OR
    (auth.user_role() = 'rufero' AND rufero_id = auth.uid())
  )
);

-- ACTIVITIES: insert by service role only, no update/delete
CREATE POLICY "activities_select" ON activities FOR SELECT USING (
  tenant_id = auth.tenant_id() AND auth.user_role() IN ('owner','admin')
);

-- NOTIFICATIONS: user sees only their own
CREATE POLICY "notifs_select" ON notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "notifs_update" ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- PLATFORM_CONFIG + COMMISSION_TRANSACTIONS: super_admin only
CREATE POLICY "platform_config_all" ON platform_config FOR ALL USING (
  auth.user_role() = 'super_admin'
);
CREATE POLICY "commission_all" ON commission_transactions FOR ALL USING (
  auth.user_role() = 'super_admin'
);
```

### Storage Buckets

In `supabase/config.toml`, add:
```toml
[storage]
enabled = true

[storage.buckets.documents]
public = false
file_size_limit = "10MB"
allowed_mime_types = ["application/pdf"]

[storage.buckets.call-recordings]
public = false
file_size_limit = "50MB"
allowed_mime_types = ["audio/mpeg", "audio/wav"]

[storage.buckets.inspection-photos]
public = false
file_size_limit = "10MB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp"]
```

Or create them via Supabase dashboard → Storage → New Bucket (toggle off "Public bucket").

### ✅ Checkpoint
```sql
-- Run in Supabase SQL editor as two different tenant users
-- Tenant A user should get 0 rows from Tenant B's prospects:
SELECT count(*) FROM prospects WHERE tenant_id = '<tenant_b_id>';
-- Expected: 0
```
- Storage: try accessing a file URL directly in browser → should return 400/403

---

## Stage 6 — provision-tenant Edge Function

**Goal:** One API call creates a fully provisioned tenant (DB row + auth user + Stripe customer).

### File: `supabase/functions/provision-tenant/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { name, slug, ownerEmail, planTier = 1 } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })

  // 1. Insert tenant
  const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert({ name, slug, plan_tier: planTier, trial_expires_at: trialExpiresAt })
    .select()
    .single()
  if (tenantErr) return new Response(JSON.stringify({ error: tenantErr.message }), { status: 400 })

  // 2. Create auth user for owner
  const tempPassword = crypto.randomUUID()
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: tempPassword,
    user_metadata: { tenant_id: tenant.id, role: 'owner' },
    email_confirm: true,
  })
  if (authErr) {
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return new Response(JSON.stringify({ error: authErr.message }), { status: 400 })
  }

  // 3. Insert user record
  await supabase.from('users').insert({
    id: authUser.user.id,
    tenant_id: tenant.id,
    email: ownerEmail,
    role: 'owner',
  })

  // 4. Create Stripe customer
  let stripeCustomerId: string | null = null
  try {
    const customer = await stripe.customers.create({ email: ownerEmail, name, metadata: { tenant_id: tenant.id } })
    stripeCustomerId = customer.id
    await supabase.from('tenants').update({ stripe_customer_id: customer.id }).eq('id', tenant.id)
  } catch (e) {
    console.error('Stripe customer creation failed (non-fatal):', e)
  }

  // 5. Async: Telnyx + SendGrid (best-effort, non-blocking)
  EdgeRuntime.waitUntil((async () => {
    // Provision Telnyx number — implement when Telnyx keys are set
    // Provision SendGrid subuser — implement when SendGrid key is set
  })())

  return new Response(
    JSON.stringify({
      tenant_id: tenant.id,
      owner_id: authUser.user.id,
      temp_password: tempPassword,
      trial_expires_at: trialExpiresAt,
      stripe_customer_id: stripeCustomerId,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
```

### Deploy
```bash
supabase functions deploy provision-tenant --no-verify-jwt
# Set secrets:
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set SENDGRID_API_KEY=...
supabase secrets set TELNYX_API_KEY=...
```

### Test
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/provision-tenant \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Storm Pro Roofing","slug":"storm-pro","ownerEmail":"owner@stormpro.com"}'
```

### ✅ Checkpoint
- Response contains `tenant_id`, `owner_id`, `temp_password`
- Check Supabase Auth dashboard → new user exists with correct metadata
- Check `tenants` table → new row with `stripe_customer_id` populated
- Check Stripe dashboard → new customer created

---

## Stage 7 — Auth Integration

**Goal:** Login works on web and mobile using the provisioned owner account.

### 7a — Next.js Web

**`apps/web/lib/supabase/client.ts`** (browser):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`apps/web/lib/supabase/server.ts`** (RSC / Server Actions):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**`apps/web/middleware.ts`**:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**`apps/web/app/(auth)/login/page.tsx`** — email/password form that calls:
```typescript
const supabase = createClient()
const { error } = await supabase.auth.signInWithPassword({ email, password })
```
On success, redirect to `/`.

### 7b — Flutter Mobile

**`apps/mobile/lib/core/config/supabase_config.dart`**:
```dart
class SupabaseConfig {
  static const String url = String.fromEnvironment('SUPABASE_URL');
  static const String anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
}
```

**`apps/mobile/lib/main.dart`**:
```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/config/supabase_config.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
  );
  runApp(const RoofAidApp());
}
```

Build the auth DDD feature:
- `domain/entities/user_entity.dart` — plain Dart class (no Supabase dependency)
- `domain/repositories/auth_repository.dart` — abstract interface
- `domain/usecases/sign_in.dart` — calls repo, returns `Either<Failure, UserEntity>`
- `data/datasources/auth_remote_datasource.dart` — `Supabase.instance.client.auth.signInWithPassword(...)`
- `data/repositories/auth_repository_impl.dart` — implements abstract repo
- `presentation/bloc/auth_bloc.dart` — `AuthSignInRequested` → `AuthAuthenticated` / `AuthError`
- `presentation/pages/login_page.dart` — form with BlocBuilder

Run with secrets:
```bash
flutter run \
  --dart-define=SUPABASE_URL=https://xxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...
```

### ✅ Checkpoint
- Web: visit `localhost:3000` → redirected to `/login`
- Web: login with provisioned owner credentials → lands on dashboard
- Flutter: login screen appears → enter credentials → navigates to home
- Both: JWT in browser/app contains `user_metadata.tenant_id` and `user_metadata.role`

---

## Stage 8 — CI/CD Wiring

**Goal:** Push to `main` → web deploys to Vercel automatically; mobile build runs on PR.

### 8a — Web (Vercel)

1. Connect repo to Vercel at vercel.com/new
2. Framework preset: **Next.js**
3. Root Directory: `apps/web` (or use Turborepo preset — Vercel auto-detects)
4. Build command: `cd ../.. && pnpm build --filter=@roof-aid/web` (Turbo handles deps)
5. Add all env vars from `.env.example` in Vercel dashboard → Settings → Environment Variables

**`.github/workflows/web-deploy.yml`** (optional — Vercel GitHub integration handles this automatically):
```yaml
name: Web Deploy
on:
  push:
    branches: [main]
    paths: ['apps/web/**', 'packages/**']
```

### 8b — Mobile Build (GitHub Actions)

**`.github/workflows/mobile-build.yml`**:
```yaml
name: Mobile Build
on:
  push:
    branches: [main]
    paths: ['apps/mobile/**']
  pull_request:
    paths: ['apps/mobile/**']

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.27.0'
          channel: stable
      - name: Install dependencies
        run: flutter pub get
        working-directory: apps/mobile
      - name: Analyze
        run: flutter analyze
        working-directory: apps/mobile
      - name: Build APK
        run: |
          flutter build apk --release \
            --dart-define=SUPABASE_URL=${{ secrets.SUPABASE_URL }} \
            --dart-define=SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
        working-directory: apps/mobile
      - uses: actions/upload-artifact@v4
        with:
          name: android-release-apk
          path: apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to GitHub repo → Settings → Secrets.

### ✅ Checkpoint
- Push a commit to `main` → Vercel deployment kicks off automatically
- Open PR with mobile changes → GitHub Actions builds APK
- Vercel deployment URL is accessible and shows the login page

---

## Final M1 Verification Checklist

```
[ ] pnpm dev → Next.js at localhost:3000 without errors
[ ] flutter run → login screen on simulator
[ ] Supabase dashboard → 15 tables + PostGIS extension enabled
[ ] RLS: user from Tenant A cannot read Tenant B's prospects
[ ] provision-tenant curl → returns tenant_id + owner credentials
[ ] Owner logs in on web → lands on dashboard
[ ] Owner logs in on Flutter → lands on home screen
[ ] Storage buckets: documents, call-recordings, inspection-photos — all private
[ ] .env.example documents all 10 required secrets
[ ] Vercel deployment live and accessible
[ ] GitHub Actions mobile build passes
```

---

## Quick Reference — Key Commands

```bash
# Start dev
pnpm dev                                    # all apps via Turborepo
cd apps/web && pnpm dev                     # web only
cd apps/mobile && flutter run               # mobile only

# Supabase
supabase start                              # local stack
supabase db push                            # push migrations to remote
supabase functions deploy provision-tenant  # deploy edge function
supabase functions serve provision-tenant   # test locally

# Build
pnpm build                                  # all apps
cd apps/web && pnpm build                   # web only
cd apps/mobile && flutter build apk         # Android
cd apps/mobile && flutter build ipa         # iOS (macOS only)

# pnpm workspace tips
pnpm add <pkg> --filter @roof-aid/web       # add to web app only
pnpm add <pkg> -w                           # add to workspace root
```