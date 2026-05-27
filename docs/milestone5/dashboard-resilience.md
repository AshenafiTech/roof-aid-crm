# Dashboard Resilience — Stop "This page couldn't load" Errors

## Purpose

End-users were intermittently seeing Chrome's "This page couldn't load"
screen on dashboard routes. That message appears when the server returns
a 5xx without renderable HTML — i.e. an uncaught Server Component error
that escapes all error boundaries.

Root-cause audit found three things stacked on top of each other:

1. **No root error boundary.** `app/error.tsx` did not exist, so any
   throw that bubbled out of a layout or page fell through to Next.js's
   default response — which the browser surfaces as a generic page-load
   failure.
2. **No middleware error handling.** [middleware.ts:54-56](../../apps/web/middleware.ts#L54-L56) awaited `supabase.auth.getUser()` with no try/catch. A
   single transient flake on the Supabase Auth API took down *every*
   page load with a 500.
3. **Dashboard layout had four parallel awaits, all unguarded.** [(dashboard)/layout.tsx:23-27](../../apps/web/app/(dashboard)/layout.tsx#L23-L27) ran `getUnreadNotificationCount`, `getRecentNotifications`, and
   `getUnreadEmailCount` in parallel with `getCurrentUser`. If any one
   of these threw (Supabase blip, RLS regression, a slow query), the
   layout itself crashed and every dashboard route went down with it.

This change closes all three.

## What changed

### 1 · Root error boundary — [app/error.tsx](../../apps/web/app/error.tsx)

New `"use client"` error boundary at the app root. Renders a friendly
two-button retry page ("Try again" / "Go home") when any
unhandled-by-segment error reaches the root. Logs to Vercel with prefix
`[root-error-boundary]` and includes the Next.js error `digest` so
support can correlate with logs.

### 2 · Dashboard segment error boundary — [app/(dashboard)/error.tsx](../../apps/web/app/(dashboard)/error.tsx)

Catches errors that escape the dashboard layout. Renders inside the page
content area (sidebar stays mounted), so the user can navigate elsewhere
instead of being stranded on a full-screen error page. Logs with prefix
`[dashboard-error-boundary]`.

### 3 · Middleware fail-open — [middleware.ts](../../apps/web/middleware.ts)

`supabase.auth.getUser()` is now wrapped in `try/catch`. On error:
- Logs `[middleware:auth] getUser threw` with the offending pathname and
  message.
- Treats the request as unauthenticated for this hop. Downstream
  middleware logic redirects to `/login` for protected routes or lets
  public routes render normally.

Net effect: a transient Supabase Auth flake no longer takes down every
page in the app — affected requests get a `/login` redirect at worst,
which the user can simply re-attempt.

### 4 · Layout-level fetch isolation — [(dashboard)/layout.tsx](../../apps/web/app/(dashboard)/layout.tsx)

`getCurrentUser` continues to throw — it represents authoritative auth
that can't be safely faked. But the three side-bar fetches
(`getUnreadNotificationCount`, `getRecentNotifications`,
`getUnreadEmailCount`) each got a `.catch(...)` that:
- Logs the failure with a distinct prefix
  (`[dashboard-layout] unread-count failed`, etc.).
- Returns a safe default (`0`, `[]`, `0`).

Net effect: a slow notification query no longer takes down the entire
dashboard. The customer sees a "0 unread" counter for one render cycle
instead of a broken page.

## What this does NOT change

- The atomic purchase-and-attach flow, white-label vendor scrub, and
  earlier UX polish are unchanged.
- `getCurrentUser` still throws (or redirects) on real auth failures —
  by design.
- The Supabase auth flow is unchanged — we only added safety nets, not
  alternate auth paths.

## How to triage future errors

| Symptom | Where to look |
|---|---|
| "Something went wrong" full-screen | `grep '\[root-error-boundary\]' vercel logs` |
| "Something went wrong" inside dashboard shell | `grep '\[dashboard-error-boundary\]' vercel logs` |
| Random redirects to `/login` from authenticated users | `grep '\[middleware:auth\]' vercel logs` (transient Supabase flakes) |
| Stale notification counters / empty notification dropdown | `grep '\[dashboard-layout\]' vercel logs` |

Each log line includes enough context (path, user id, original error
message) to identify whether the failure is Supabase-side, code-side, or
data-shape-related.

## Verification

- Typecheck passes: `pnpm --filter @roof-aid/web exec tsc --noEmit`.
- Manual: deliberately throw inside any dashboard page → see the
  segment error boundary. Throw inside the dashboard layout's
  `getCurrentUser` → segment boundary still catches. Throw inside the
  root layout (rare) → root boundary catches.
