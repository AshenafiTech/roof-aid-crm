# Map View Temporarily Disabled

## Purpose

Temporarily disable the Map view in the prospects/new-leads listing so the List view is the default (and only) experience. The Map view code is preserved behind comments for easy restoration later.

## Scope

Changes made in `apps/web/components/shared/prospect-list-view.tsx`.

## Changes

1. **Default view mode forced to `"list"`**
   - The previous `useState` initializer read `VIEW_MODE_KEY` from `localStorage` and defaulted to `"map"`.
   - Replaced with a hard-coded `useState<"map" | "list">("list")`.
   - Original initializer kept commented directly below the new line for easy restoration.

2. **Map/List toggle buttons commented out**
   - The `<div className="flex rounded-md border">` containing the `Map` and `List` buttons is wrapped in JSX comments.
   - Added `hidden sm:flex` to the commented wrapper so that, when re-enabled, the toggle only renders on screens larger than mobile (map view is desktop/tablet only).
   - List view remains the only experience across all breakpoints while the toggle is disabled.

## Mobile vs. Desktop Behavior

- **Mobile (`< sm`)**: only the List view is available. No toggle is shown.
- **Desktop / Tablet (`>= sm`)**: only the List view is available (for now). When the toggle is uncommented, it is gated by `hidden sm:flex` so Map view will stay desktop-only.

## How to Re-Enable Map View

1. In `prospect-list-view.tsx`, restore the original `useState` initializer (remove the hard-coded `"list"` line and uncomment the block directly below it).
2. Uncomment the Map/List toggle `<div>` block. Keep the `hidden sm:flex` class so Map stays desktop-only.
3. No changes are needed to the map rendering (`{viewMode === "map" && ...}`) or the `MapCardItem` branch — both are left intact and become reachable again automatically.

## Notes

- The `Map` icon import from `lucide-react` and the `persistViewMode` / `VIEW_MODE_KEY` helpers are left in place so the commented code continues to type-check without modification.
- `npx tsc --noEmit` passes after the change.
