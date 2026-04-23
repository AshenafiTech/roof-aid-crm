# Map Proximity Search (Right-Click + Radius Slider)

## Purpose

Let a rep right-click anywhere on the map to search the currently
displayed tab (Prospects or New Leads) for records within a chosen
radius of that point. The radius is picked via a slider, and the
resulting set is visible on both the map (pins) and the left list
panel.

## UX

1. **Right-click** anywhere on the map in map view → Leaflet popup
   opens at the click point.
2. The popup contains:
   - A heading `Search {leads|prospects}` (derived from `basePath`).
   - Current radius label in km.
   - A range slider (0.5 – 50 km, step 0.5, default 5 km or last used).
   - A **Search** button and, once a proximity search is active, a
     **Clear** button.
3. On **Search**, a shaded `Circle` renders at the point with the
   chosen radius, and both the list panel and map pins are restricted
   to rows inside that circle.
4. The left panel's count line switches to
   `N within X.X km of pinned point` and exposes a **Clear radius**
   button. A hint overlay (`Right-click the map to search by radius`)
   appears when no proximity search is active.

## Scope of search (important caveat)

This is a **client-side filter over the rows already loaded** via the
paginated query. It does **not** widen the database query, so a
proximity circle will only find records within the current 60-row page
(or whatever's been expanded via **Load N More**). To cover the entire
dataset, the rep can either:

- Load more pages first, then right-click and search, or
- Follow-up work: add a Supabase RPC that uses `earth_distance`
  (`cube` + `earthdistance` extensions) or PostGIS on the `point`
  column to compute server-side. `coordinates` is a PG `point`
  (`apps/supabase/migrations/002_core_tables.sql`), so an RPC is the
  cleanest extension point. PostGIS is already enabled
  (`001_extensions.sql`). Out of scope for this change.

## Implementation

### `apps/web/components/shared/prospect-map-leaflet.tsx`

- Added imports for `Circle` and `useMapEvents` from `react-leaflet`
  and `useState` from React.
- New `ContextMenuCapture` component: hooks `useMapEvents` and
  forwards `contextmenu` coords to a parent handler.
- New props on the default export:
  - `proximity: { lat, lng, radiusKm } | null`
  - `onProximityChange: (p | null) => void`
  - `tabLabel: string` (for the popup heading)
- `pendingPoint` local state holds the point the user right-clicked
  and the currently-selected radius. A `<Popup position={...}>`
  renders a slider + Search/Clear buttons; confirming calls
  `onProximityChange`.
- When `proximity` is set, a `<Circle>` renders with a subtle blue
  fill at `radiusKm * 1000` meters, non-interactive so it doesn't
  block marker clicks.

### `apps/web/components/shared/prospect-map.tsx`

- Re-exported `ProximitySearch` type.
- Wrapper component forwards the new proximity/tabLabel props to the
  dynamically-imported Leaflet map.

### `apps/web/components/shared/prospect-list-view.tsx`

- Added a `haversineKm(lat1, lng1, lat2, lng2)` helper (spherical-earth,
  R = 6371 km). Sufficient for UI-scale filtering; not geodetic.
- New `proximity: ProximitySearch | null` state.
- New `displayRows` = `rows` when proximity is null; otherwise
  filtered by `haversineKm(proximity, coords) <= radiusKm`.
  Rows with unparseable coords are excluded from proximity results
  (they can't be placed on the map anyway).
- Replaced `rows` with `displayRows` for:
  - The empty-state check.
  - The map-mode card list and list-mode row list.
  - The map's `prospects` prop.
  - The `showing` count and `allChecked` / "select all" derivation.
- `selected` still resolves against the full `rows`, so a selection
  made before the proximity filter was applied is not forcibly
  dropped.
- Count line adapts: shows `N within X.X km of pinned point` + a
  `Clear radius` button when proximity is active.
- Small hint badge over the map (top-left) appears when no proximity
  search is active.

## Verification

- `npx tsc --noEmit` passes from `apps/web`.
- Manual sanity: right-click on the map opens the radius popup;
  changing the slider updates the label; clicking **Search** draws
  the circle, trims the left list, and restricts the pins; **Clear
  radius** restores the full loaded set.

## Known limitations / follow-ups

- **Client-side only** (see caveat above).
- **Bulk-action scope**: `allChecked` and "select all" now operate on
  `displayRows`; bulk actions affect only rows visible under the
  proximity filter. This matches the visible UI but means clearing
  the radius after selecting won't change the selection.
- **No URL persistence**: proximity is in-memory. Reloading the page
  drops it. If we want deep-link-friendly proximity searches, add
  `near=lat,lng&radius=km` URL params.
- **Camera does not refit** when a proximity search is applied —
  intentional to respect manual pan/zoom. If reps want auto-zoom to
  the circle, add a one-shot `fitBounds` on proximity change.
