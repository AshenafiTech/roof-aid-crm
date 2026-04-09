# Stage 7a — Next.js Web Auth Integration

> Completed: 2026-04-09

## Purpose

Implement Supabase authentication for the Next.js web app, including session management, route protection, role-based access control, and a production-grade login page.

## What Was Done

### 1. Supabase Client Helpers

| File | Usage |
|------|-------|
| `apps/web/lib/supabase/client.ts` | Browser-side singleton client for client components |
| `apps/web/lib/supabase/server.ts` | Per-request server client for RSC, Server Actions, Route Handlers |
| `apps/web/lib/supabase/database.types.ts` | Placeholder types (regenerate with `npx supabase gen types typescript --linked`) |

**Key decisions:**
- Browser client is a singleton to prevent multiple GoTrue listeners (memory leak prevention)
- Server client is per-request — each request has its own cookie context
- `getUser()` is used instead of `getSession()` for server-side validation (prevents JWT spoofing)

### 2. Auth Middleware (`apps/web/middleware.ts`)

- **Session refresh:** Validates and refreshes JWT tokens on every request via `getUser()`
- **Auth guard:** Unauthenticated users are redirected to `/login?next=/original-path`
- **Reverse guard:** Authenticated users on `/login` are redirected to `/`
- **Role-based access control:**
  - `/super-admin` → `super_admin` only
  - `/admin/*` → `owner`, `admin`, `super_admin`

### 3. Login Page (`apps/web/app/(auth)/login/`)

| File | Purpose |
|------|---------|
| `page.tsx` | Server component — metadata, card layout, Suspense wrapper |
| `login-form.tsx` | Client component — form with validation, loading/error states |
| `actions.ts` | Server action — `signInWithPassword`, user-friendly error mapping |

**Features:**
- Zod schema validation (email format, password min 6 chars)
- react-hook-form integration (no unnecessary re-renders)
- Show/hide password toggle
- Loading spinner with disabled fields during submission
- `next` query param redirect (preserves destination after auth redirect)
- Rate-limit (429) error handling
- Accessible: `aria-invalid`, `htmlFor`, `autoComplete` attributes

### 4. Dashboard Layout (`apps/web/app/(dashboard)/`)

| File | Purpose |
|------|---------|
| `layout.tsx` | Server component — fetches user profile from `users` table, provides context |
| `dashboard-shell.tsx` | Client component — top bar with branding, role, user name, sign-out |
| `actions.ts` | Server action for sign-out |
| `page.tsx` | Dashboard home with placeholder metric cards |

**Supporting files:**
- `apps/web/lib/types/auth.ts` — `AuthUser` and `UserRole` types (matches `users` table schema)
- `apps/web/components/providers/user-provider.tsx` — React context + `useUser()` hook

### 5. Root Layout Updates

- Updated metadata with title template: `%s — Roof-Aid CRM`
- Removed conflicting `app/page.tsx` (both it and `app/(dashboard)/page.tsx` resolved to `/`)

## Architecture Notes

- **Double auth check:** Middleware handles redirects, dashboard layout re-verifies as safety net
- **User data from DB, not JWT:** Layout fetches from `users` table for fresh role/active status
- **Context pattern:** `useUser()` throws if used outside `UserProvider` — bugs surface immediately
- **Server actions for auth:** Credentials never touch the client JS bundle

## Verification

- `pnpm build` passes with no errors
- All dashboard routes are dynamic (server-rendered)
- Login page is static (prerendered)

## TODO

- [ ] Generate real database types: `npx supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`
- [ ] Test full auth flow: login → dashboard → sign out
- [ ] Stage 7b: Flutter mobile auth integration
