# Switch all distance measurements to miles

US users don't think in kilometers, so every user-facing distance and
radius is now in miles. The change is end-to-end: TypeScript types, URL
parameters, UI copy, the haversine helper, the Google Map circle radius,
and the Postgres proximity RPC.

## Changes

### Web app

- `apps/web/lib/queries/prospects.ts` — `ProspectFilters.radiusKm` →
  `radiusMiles`.
- `apps/web/lib/queries/parse-list-params.ts` — URL param
  `radiusKm` → `radiusMiles`; downstream filter field renamed.
- `apps/web/components/shared/prospect-map.tsx` —
  `ProximitySearch` type now carries `radiusMiles`.
- `apps/web/components/shared/prospect-map-google.tsx`:
  - All `radiusKm` fields renamed to `radiusMiles`.
  - Introduced `METERS_PER_MILE = 1609.344`. The Google Maps `Circle`
    component still expects meters, so we multiply by this constant.
  - Right-click default radius dropped from 5 km to 3 miles.
  - Slider `min/max/step` adjusted to mile-friendly values
    (0.25–30 mi, 0.25 mi steps).
  - Pending-point InfoWindow now shows "X.X mi".
- `apps/web/components/shared/prospect-list-view.tsx`:
  - `haversineKm` renamed to `haversineMiles`; Earth radius constant
    changed from 6371 km to 3958.8 mi.
  - URL writes/reads use `radiusMiles`.
  - Coord-search input placeholder changed from "Radius (km)" to
    "Radius (mi)"; default fallback radius from 5 to 3.
  - Caption "X within Y km of pinned point" → "X within Y mi of pinned
    point".

### Database

- `supabase/migrations/023_search_prospects_proximity_miles.sql` — drops
  the km-based `search_prospects_proximity_ids` (added in migration 009)
  and recreates it with parameter `p_radius_miles`. Internally we still
  use `ST_DWithin` on geography (which takes meters), multiplying by
  `1609.344`.

The web app does not currently call this RPC (proximity search is
client-side filtering of the rendered rows), so renaming the parameter
is safe with no caller updates required.

## Why a new migration instead of editing 009

Migration 009 has already been applied to dev/prod databases. Editing
its file in place wouldn't replay it. A new migration that drops and
recreates the function ensures every environment ends up with the
mile-based signature.

## Conversion constants

- `1 mile = 1609.344 meters` (used for the Google Maps `Circle.radius`
  prop and the `ST_DWithin` distance threshold).
- `Earth radius ≈ 3958.8 miles` (used in the haversine formula).
