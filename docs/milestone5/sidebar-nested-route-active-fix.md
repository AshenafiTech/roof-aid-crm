# Sidebar — Fix Both "Settings" and "Roles & Privileges" Highlighting Together

## Purpose

When navigating to `/admin/settings/roles`, the sidebar lit up **two**
nav items at the same time:

- **Settings** (`/admin/settings`)
- **Roles & Privileges** (`/admin/settings/roles`)

The expected behavior is that only the most-specific nav item — the one
the user actually navigated to — should be marked active.

## Root cause

`isRouteActive` in `apps/web/app/(dashboard)/nav-items.ts` returned
`true` for any nav item whose `href` was either equal to the current
pathname **or** a prefix of it:

```ts
return pathname === href || pathname.startsWith(`${href}/`);
```

With nav items at `/admin/settings` and `/admin/settings/roles`, both
matched simultaneously for the path `/admin/settings/roles`.

## Fix

`isRouteActive` now optionally accepts the list of all visible nav
hrefs. When a candidate href is a prefix match, it also checks whether
any **more specific** href in the list matches the same pathname; if
so, this candidate is no longer considered active and defers to the
deeper item.

```ts
export function isRouteActive(
  pathname: string,
  href: string,
  allHrefs?: readonly string[],
) {
  if (href === "/") return pathname === "/";
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  if (allHrefs) {
    for (const other of allHrefs) {
      if (other === href || other === "/") continue;
      if (other.length <= href.length) continue;
      if (pathname === other || pathname.startsWith(`${other}/`)) return false;
    }
  }
  return true;
}
```

`SidebarNav` builds `allHrefs` once from the user's filtered nav set
(union across Main / Tools / Admin sections) and passes it down to each
`Section`, which forwards it to `isRouteActive`. The third argument is
optional so existing callers don't break.

## Files

- `apps/web/app/(dashboard)/nav-items.ts` — updated `isRouteActive`.
- `apps/web/app/(dashboard)/sidebar-nav.tsx` — builds `allHrefs` and
  threads it through `Section` → `isRouteActive`.

## Notes

This generalises to any future nested route pair. If a new admin page
sits under another nav item's path, no additional configuration is
required — the deepest matching item wins automatically.
