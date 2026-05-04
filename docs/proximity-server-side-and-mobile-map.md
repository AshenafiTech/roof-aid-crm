# Server-Side Proximity Search, Auto-Zoom, and Mobile Map

## Purpose

Three follow-up fixes to the M3 map experience flagged during UAT:

1. **Proximity search now spans the entire database**, not just the rows already paginated into the page.
2. **The map auto-zooms to fit the proximity circle** as soon as a search is applied (or its radius changes).
3. **The map is now visible on mobile** — stacked above the prospect list — and the Map / List toggle is available on phones.

## Scope

- `supabase/migrations/009_search_prospects_proximity.sql` (new)
- `apps/web/lib/queries/prospects.ts`
- `apps/web/app/(dashboard)/prospects/page.tsx`
- `apps/web/app/(dashboard)/new-leads/page.tsx`
- `apps/web/components/shared/prospect-list-view.tsx`
- `apps/web/components/shared/prospect-map-leaflet.tsx`

## 1. Server-side proximity (whole database)

### New PostgreSQL function

`search_prospects_proximity_ids(p_lat, p_lng, p_radius_km, p_limit)` returns
the ids of every prospect inside the radius, ordered by distance ascending.

- Runs as `SECURITY INVOKER` so the existing prospects RLS policy (tenant
  scoping + role rules) still applies — no `tenant_id` argument needed.
- Uses PostGIS: casts the `point` `coordinates` column to `geography(Point,
  4326)` and runs `ST_DWithin` for meter-accurate, great-circle distance.
- Capped at 5000 ids server-side as a defensive ceiling. The default request
  cap from the web app is 2000.

### Query layer

`ProspectFilters` now accepts an optional `proximity: { lat, lng, radiusKm }`.
When set, `listProspects` first calls the RPC to get the matching ids, then
re-fetches the full rows via `.in('id', ids)` so the existing
`assigned_user` join, ordering, and other filters still work. Pagination is
skipped when proximity is active — proximity already bounds the result set.

If the RPC returns zero ids, we short-circuit with an empty rows array.

### URL contract

Proximity is now persisted in the URL as `nearLat`, `nearLng`,
`nearRadiusKm`. Both `prospects/page.tsx` and `new-leads/page.tsx` parse
those query params and forward them to `listProspects`.

The list-view component:

- Reads proximity from `useSearchParams()` instead of holding it in local
  state.
- Routes Search / Clear buttons through `router.push` so the URL becomes the
  source of truth (and a refresh preserves the active proximity search).
- Drops the old client-side haversine filter — `displayRows` is now just
  `rows`, since the server has already trimmed.
- The **Clear** filter button preserves `nearLat / nearLng / nearRadiusKm`
  in the staged draft, since proximity is set via the map (not the filter
  bar) and the user shouldn't lose it just because they cleared filters.

## 2. Auto-fit camera to the proximity circle

`CameraController` in `prospect-map-leaflet.tsx` now also takes `proximity`.
When the proximity coordinates / radius change, it calls
`map.fitBounds(center.toBounds(radiusM * 2))` so the search circle fits the
visible viewport with a small padding margin.

A ref (`lastFitProximity`) tracks the last fitted (lat,lng,radius) tuple so:

- A user pan/zoom after the search is **not** clobbered.
- Changing the radius (or running a new right-click search) re-fits.
- Clearing proximity resets the ref so the next search will fit again.

Manual zoom/pan freedom is preserved between searches.

## 3. Mobile map layout

### Toggle visible on mobile

The Map / List buttons in the filter bar are no longer `hidden sm:flex`.
On phones the icons render without their text labels to save horizontal
space.

### Stacked content layout

The content region is now:

- `flex-col` on `< sm` — map slab (280 px tall, fixed) on top, prospect
  list below.
- `sm:flex-row` on `>= sm` — list panel on the left, full-height map on
  the right (unchanged from before).

A second `<ProspectMap>` instance handles the mobile slab so it can have
its own height and the desktop layout doesn't have to be CSS-juggled into
two configurations. The mobile map shares the same proximity URL state, so
right-clicking (or long-pressing) on the mobile map runs a server-side
proximity search just like the desktop one.

The list panel's old `w-full` (when in map mode on mobile) was replaced
with `flex-1` plus `min-h-0` so the list scrolls inside the remaining
viewport height under the map.

## Verification

- `npx tsc --noEmit` from `apps/web` passes.
- Manual sanity:
  - Right-click map → set radius → only matching prospects load (verified by
    setting a radius small enough to exclude rows the page hadn't yet
    paginated to before — they now appear).
  - Refreshing with an active radius keeps the search applied (URL state).
  - Camera auto-fits the new circle on first search and on radius change.
  - On a narrow viewport, map appears above the list and the toggle is
    visible.

## Apply the migration

```bash
# Local stack
supabase db reset
# Or, against an existing DB
supabase migration up
```

## Known caveats / follow-ups

- The RPC scope is "every prospect this user can see (per RLS)" — additional
  filters (status, city, search) are still applied to the post-RPC `.in(id)`
  query rather than inside the RPC. Pushing those into the function would
  let it stop earlier on huge tenants but isn't necessary at current data
  volumes.
- Mobile map height is fixed at 280 px. A drag handle to resize the slab is
  a possible follow-up if reps want more or less map.
- Long-press on Leaflet maps to trigger a context menu is browser-dependent
  on touch devices. If reps report it doesn't work on iOS Safari, we'll add
  an explicit "Search here" floating action button on mobile.
