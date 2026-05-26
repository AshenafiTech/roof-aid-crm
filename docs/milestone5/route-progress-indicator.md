# Global Route Progress Indicator

## Purpose

The app had no visual feedback during route navigation. When a user clicked a sidebar link or any internal link, the screen would freeze until the new page's server work finished — leaving them wondering whether their click registered. This adds a thin animated bar at the top of the viewport that appears immediately on navigation and completes when the new URL settles.

## What was added

- `apps/web/components/route-progress.tsx` — a small client component that:
  - Listens for clicks on internal `<a>` elements (sidebar nav, in-page links, etc.) and starts the bar.
  - Completes the bar when `usePathname()` or `useSearchParams()` change (the navigation finished).
  - Uses an asymptotic curve (creeps toward 90% while pending, snaps to 100% on completion) so it never visibly stalls.
  - Has an 8s safety timeout so the bar can never get stuck visible if something goes wrong.
  - Wraps `useSearchParams` in `<Suspense>` per the App Router requirement.
- Mounted once in `apps/web/app/layout.tsx` (root layout) so it covers every route — dashboard, auth, landing — without per-route wiring.

## Visual design

- Position: `fixed`, top of viewport, full width, 2px tall, `z-100`.
- Color: `bg-primary` (uses the existing theme token, so it follows light/dark mode and any tenant accent color).
- Subtle glow via `box-shadow` for visibility on light backgrounds.

## Coverage notes

- Click-driven navigation (Link components, plain anchors) — covered.
- Programmatic `router.push` / `router.replace` — the bar does not pre-emptively start, but it will still complete-flash when the URL changes; the safety timeout prevents stuck state.
- Browser back/forward — same as above.
- Same-URL clicks and hash/`mailto:`/`tel:` links are filtered out to avoid false starts.

## Files changed

- `apps/web/components/route-progress.tsx` (new)
- `apps/web/app/layout.tsx` (import + mount)
