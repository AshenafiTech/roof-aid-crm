# Map View Re-Enabled

## Purpose

Restore the Map view in the prospects / new-leads listing. Map is the default
experience again on desktop/tablet; List remains available via the toggle and
is the only option on mobile.

## Scope

Changes in `apps/web/components/shared/prospect-list-view.tsx`.

## Changes

1. **`viewMode` initializer restored**
   - Removed the hard-coded `useState<"map" | "list">("list")`.
   - Reinstated the original initializer that reads `VIEW_MODE_KEY` from
     `localStorage` and falls back to `"map"` when nothing is stored or
     when rendering on the server.

2. **Map/List toggle uncommented**
   - The `<div className="hidden sm:flex rounded-md border">` wrapping the
     `Map` and `List` buttons is live again.
   - `hidden sm:flex` is kept so the toggle (and Map view) stay desktop /
     tablet only; mobile users see the list exclusively.

## Mobile vs. Desktop Behavior

- **Mobile (`< sm`)**: List view only. Toggle is hidden.
- **Desktop / Tablet (`>= sm`)**: Toggle is visible. Map is the default
  choice, overridable per-browser via `localStorage` (`roofaid-view-mode`).

## Verification

- `npx tsc --noEmit` passes from `apps/web`.
- `{viewMode === "map" && ...}` branches and the `MapCardItem` rendering
  were left intact during the disable, so no additional wiring was needed.

## Related

- Previous disable doc: `docs/map-view-temporarily-disabled.md`
- Map implementation: `apps/web/components/shared/prospect-map.tsx`,
  `apps/web/components/shared/prospect-map-leaflet.tsx`
