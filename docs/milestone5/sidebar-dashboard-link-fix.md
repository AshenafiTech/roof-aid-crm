# Sidebar Dashboard Link Fix

## Purpose

The "Dashboard" entry in the sidebar navigation was pointing to `/` (the public landing page) instead of the authenticated dashboard route at `/dashboard`. Clicking Dashboard from inside the app would bounce users out to the marketing/landing page, which is not allowed.

## Change

Updated the Dashboard nav item's `href` to `/dashboard`.

- File: `apps/web/app/(dashboard)/nav-items.ts`
- Before: `href: "/"`
- After: `href: "/dashboard"`

## Notes

- The `/dashboard` route already exists at `apps/web/app/(dashboard)/dashboard/`, so no new route was needed.
- `isRouteActive(pathname, href)` in the same file already handles non-root hrefs correctly (`pathname === href || pathname.startsWith(${href}/)`), so the active-state highlight works without further changes.
- Other links to `/` in `dashboard-shell.tsx` (brand mark and mobile sheet title) were left unchanged — those are intentional "home" links on the brand, not the Dashboard nav item.
