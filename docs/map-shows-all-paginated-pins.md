# Map Shows All Loaded Prospect Pins (Paginated)

## Purpose

Previously the Leaflet map only rendered a pin for the currently
*focused* (selected) prospect — every other loaded row was invisible on
the map. Users filtering in the prospects/new-leads view expected to see
pins for every loaded row, with more pins appearing as they click **Load
N More**.

## Scope

One file: `apps/web/components/shared/prospect-map-leaflet.tsx`.

## Changes

### `points` now covers every prospect with valid coords

Before, the `points` memo short-circuited on `!focused` and pushed only
the focused prospect. Replaced with a loop over the full `prospects`
array that pushes every row whose coordinates parse successfully.

```tsx
const points = useMemo(() => {
  const arr: { id: string; lat: number; lng: number; prospect: ProspectListItem }[] = [];
  for (const p of prospects) {
    const c = parseCoordinates(p.coordinates);
    if (c) arr.push({ id: p.id, lat: c.lat, lng: c.lng, prospect: p });
  }
  return arr;
}, [prospects]);
```

Because `prospect-list-view.tsx` already passes `prospects={rows}` and
`rows` grows when the user clicks **Load N More** (the `load`
URL param increases page size), newly loaded rows' pins are added to
the map automatically on the next render.

### Tooltips are hover/focus only, not permanent

With only one pin ever on the map, a `permanent` tooltip was fine.
Showing a permanent label over every pin would turn a dense map into
unreadable overlapping text, so the `Tooltip` lost its `permanent` prop
— labels appear on marker hover instead. Click-to-select via the pin's
`click` handler is unchanged, as is the enlarged/ringed highlight for
the focused marker.

## Camera behavior (unchanged)

`CameraController` still:

- `flyTo` the focused point when `focused` changes.
- `fitBounds` over `points` **once** on first render with any points
  (guarded by `didInitialFit`), so subsequent loads don't yank the
  user's pan/zoom. New pins added via Load More render inside the
  existing view; if they fall outside, the user can zoom out — we
  deliberately avoid refitting on every pagination step because it's
  jarring mid-exploration.

## Verification

- `npx tsc --noEmit` passes from `apps/web`.
- Manual sanity: load a filtered list, confirm one pin per row with
  coords, click **Load 30 More**, confirm extra pins appear without the
  camera jumping.

## Files touched

- `apps/web/components/shared/prospect-map-leaflet.tsx` (points memo +
  tooltip prop)
