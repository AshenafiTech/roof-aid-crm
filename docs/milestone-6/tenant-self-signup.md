# Tenant Self-Signup, Marketing Landing & Route Restructure

## Purpose

Two related changes that turn Roof-Aid CRM into a self-serve product:

1. **Public marketing landing page at `/`** — anyone visiting the root URL
   sees the Roof-Aid marketing site (hero, problem tiles, comparison
   table, pricing, social proof, CTA, footer) with **Sign Up** and **Log
   in** in the header.

2. **Multi-step signup wizard at `/signup`** — replaces the previous
   one-screen signup form with the 6-step onboarding flow:
   account/plan → agreements → company profile → leads → templates → done.
   Adds a **Free** plan tier in addition to Tiers 1, 2, 3A, 3B, 3C.

The dashboard, previously at `/`, has moved to `/dashboard` so the public
landing can live at the root URL.

## File map

```
apps/web/app/
  page.tsx                              # NEW — public landing (/)
  landing.css                           # NEW — landing-only styles, scoped to .ra-landing
  (auth)/
    signup/
      page.tsx                          # Hosts the wizard (server component)
      signup-wizard.tsx                 # NEW — client wizard (all 6 steps)
      signup.css                        # NEW — wizard-only styles, scoped to .ra-signup
      actions.ts                        # createAccount() + saveCompanyProfile()
  (dashboard)/
    dashboard/page.tsx                  # MOVED from (dashboard)/page.tsx — now at /dashboard
```

Removed: `(auth)/signup/signup-form.tsx` (superseded by the wizard).

## Routing changes

| Route       | Before                         | After                                                  |
| ----------- | ------------------------------ | ------------------------------------------------------ |
| `/`         | Dashboard (auth required)      | Public landing page                                    |
| `/dashboard`| —                              | Dashboard (auth required)                              |
| `/signup`   | Simple form                    | Multi-step wizard (account created at step 2)          |
| `/login`    | Form, redirect → `/`           | Form, redirect → `/dashboard`                          |

### Middleware (`apps/web/middleware.ts`)

Two route classes now exist:

- **`PUBLIC_ROUTES = ["/login"]`** — only reachable when signed-out.
  Signed-in users are bounced to `/dashboard`.
- **`ALWAYS_OPEN_ROUTES = ["/", "/signup"]`** — reachable in both states.
  The page decides what to render. `/signup` lives here because the
  wizard signs the user in part-way through (step 2) and continues on
  the same URL for steps 3-6; the middleware must not bounce.

Anything else still requires auth and redirects to `/login` with the
original path preserved in `?next=`.

### Internal redirects updated

`admin/analytics/page.tsx`, `admin/settings/phone-numbers/page.tsx`,
`admin/users/page.tsx` previously did `redirect("/")` for role-mismatch.
They now redirect to `/dashboard`. `onboarding/page.tsx`&apos;s "Back to
dashboard" link points at `/dashboard`.

## The signup wizard

### Step 1 — Account + Plan

Captures: first name, last name, company name, email, mobile phone,
state, password (≥ 8 chars), plan.

Plans available:

| ID         | Label                            | Price       | `plan_tier` value |
| ---------- | -------------------------------- | ----------- | ----------------- |
| `free`     | Free — Try Everything            | $0          | 0                 |
| `tier-1`   | Tier 1 — CRM Core                | $149/mo     | 1                 |
| `tier-2`   | Tier 2 — CRM + More Volume       | $249/mo     | 2                 |
| `tier-3a`  | Tier 3A — + Telefonista          | $899/mo     | 3                 |
| `tier-3b`  | Tier 3B — AI Caller 24/7         | $1,299/mo   | 4                 |
| `tier-3c`  | Tier 3C — Telefonista + AI       | $1,699/mo   | 5                 |

Default selection: **Free**.

### Step 2 — Agreements

Three sections (Data & Ownership, Supplement Engine Fee, Terms of
Service). All three checkboxes must be ticked before the **Create
Account** button enables.

On submit, the `createAccount` server action runs:

1. Validate inputs.
2. Reject duplicate emails up front.
3. Generate a unique tenant slug from the company name (with random
   suffix on collision).
4. Insert the `tenants` row (`plan_tier`, 14-day trial expiry,
   `features = all true` per "do not restrict anything", and `settings`
   = `{ state, selected_plan, agreements: { *_accepted_at } }`).
5. Create the auth user (`email_confirm: true`) with
   `user_metadata = { tenant_id, role: "owner" }` (middleware uses this
   for role gating).
6. Insert the `users` row (id matches `auth.users.id`, role `owner`,
   first/last name, email, phone).
7. Sign in via the cookie-bound server client so the rest of the wizard
   runs authenticated.

Failures at steps 4–6 roll back everything created earlier so no
orphan tenants or auth users are left behind.

### Step 3 — Company Profile

Captures: business address, license number (optional), website
(optional). Persisted via `saveCompanyProfile` server action into the
existing `tenants.settings` JSONB column — no schema migration needed
(`address`, `license_number`, `website`, `profile_completed_at`).

Logo upload is deferred (UI shows the dropzone but the file isn't
posted — the corresponding upload helper isn't built yet).

### Steps 4 & 5 — Leads + Templates (UI stubs)

Per the scope decision ("Account + Profile only"), these are
presentational:

- **Step 4** — Two cards (Upload list / Buy list). Both buttons advance
  to the next step. Real CSV parsing and Stripe-backed list purchase
  are out of scope for this change — those features ship from inside
  the dashboard (Prospects page already supports imports).
- **Step 5** — Read-only preview of the canned outreach templates
  (collapsible accordions).

### Step 6 — Done

Confirmation screen with a checklist. **Go to My Dashboard** navigates
to `/dashboard`.

## "Do not restrict anything"

`tenants.features` is set with every flag set to `true` regardless of
selected plan. The user explicitly asked for no feature gating right
now. When billing/gating goes live, replace the `features` literal in
`createAccount` with a plan-derived map (e.g., `FEATURES_BY_PLAN[plan]`).

## Why these decisions

- **Plain CSS in `landing.css` / `signup.css`, not Tailwind.** The HTML
  mockups use a tight bespoke design system (Bebas Neue display font,
  saturated `#1058A7` blue, custom card shadows). Re-implementing in
  Tailwind utility-by-utility would have either lost the look or
  required heavy `@layer` extensions. CSS files scoped under a single
  wrapper class (`.ra-landing`, `.ra-signup`) cannot leak into the
  dashboard.
- **Dashboard moved to `/dashboard` rather than rendering both at `/`
  via auth check.** Next.js route groups can&apos;t share a path. Having
  a clean URL split is easier to reason about, easier to deep-link, and
  easier to evolve (e.g., separate analytics, separate caching).
- **`/signup` in `ALWAYS_OPEN_ROUTES` instead of `PUBLIC_ROUTES`.** The
  wizard signs the user in at step 2 and keeps them on `/signup` for
  steps 3-6. If `/signup` were a "public-only" route, the middleware
  would bounce the user mid-wizard the moment cookies updated.
- **Plan stored in `tenants.settings.selected_plan`** in addition to
  the numeric `tenants.plan_tier`. The numeric column is the gating
  primitive (small, indexable). The settings string preserves the
  exact label the user picked (`tier-3b` vs `tier-3a`) so we can
  surface the right copy and route into the right onboarding flow
  later.

## What was NOT done in this change

- **No Stripe customer creation.** The previous `provision-tenant` edge
  function created a Stripe customer; this self-signup path skips it so
  the Free tier can complete without any payment plumbing. When billing
  is wired in, add the Stripe customer call between the auth-user insert
  and the auto sign-in.
- **No CSV ingest / list purchase / template editing persistence.** All
  of those live in step 4-5 of the wizard as stubs. The dashboard
  already supports CSV imports from the Prospects page.
- **No email verification gate.** `email_confirm: true` so the trial is
  usable immediately. Layer verification on later.
- **No CAPTCHA / rate limiting beyond Supabase Auth&apos;s built-ins.**

## Manual test plan

1. **Landing page (signed-out).** Visit `/`. Confirm marketing layout
   renders, header shows **Log in** + **Sign Up →**, all anchor links
   (`#how`, `#pricing`) scroll within the page.
2. **Landing page (signed-in).** Sign in via `/login`, then visit `/`.
   Confirm header now shows **Go to Dashboard →** instead of the
   auth links.
3. **Signup wizard happy path.**
   - From `/`, click **Sign Up**.
   - Step 1: leave a required field blank → red error.
   - Pick **Free**. Fill all fields with a fresh email + 8-char
     password. Continue.
   - Step 2: try to submit with one checkbox unchecked → button
     disabled. Check all three → button enables. Submit.
   - Verify in DB: new row in `tenants` (`plan_tier = 0`,
     `settings.state` set, `settings.selected_plan = "free"`),
     new row in `users` (role `owner`), new `auth.users` row.
   - Wizard auto-advances to step 3. Fill address, save. Verify
     `tenants.settings` merged with `address`, `license_number`,
     `website`, `profile_completed_at`.
   - Walk through steps 4, 5, 6. Click **Go to My Dashboard** → land
     on `/dashboard` already signed in.
4. **Duplicate email.** Try signing up again with the same email →
   "An account with this email already exists." No new tenant row.
5. **Tier 3 plan.** Pick **Tier 3B** at step 1 → confirm the orange
   "Tier 3 includes a setup session" banner appears.
6. **Mid-wizard refresh.** After step 2 completes (account exists),
   refresh the page. Confirm the wizard restarts at step 1 but the
   account is still in the DB and the user is signed in. (Resuming the
   wizard mid-flow is out of scope; the user can simply navigate to
   `/dashboard`.)
7. **Login redirect.** Sign in from `/login` → land on `/dashboard`,
   not `/`.
8. **Middleware role gating.** A non-admin user hitting `/admin/users`
   should be redirected to `/dashboard` (previously `/`).
