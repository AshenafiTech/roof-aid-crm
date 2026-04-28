# Stage 2 — Proximity Search (PostGIS)

**Goal:** Let a Telefonista click anywhere on the map (or on "Near Me") and see every prospect within N miles. Uses PostGIS `ST_DWithin` on a GiST-indexed `geography` column.

**Outcome:** A working radius search that returns results in under 100ms for a 10k-prospect tenant. Same RPC used by mobile in Stage 5.

**Estimated time:** 1 day

---

## 1. Why PostGIS (and not JS distance math)

| Approach | 10k prospects, 10mi radius | Correctness |
|----------|---------------------------|-------------|
| Haversine in JS, client | ~800ms + fetches every row | Correct |
| Pythagorean on lat/lng | ~200ms, ignores index | **Wrong** near poles + at date line |
| PostGIS `ST_DWithin` + GiST | **~20ms** | Correct great-circle |

PostGIS is already installed if the pre-req migration ran. `ST_DWithin(a, b, radius_meters)` on `geography` columns uses real great-circle distance and hits the GiST index we created in Stage 1.

---

## 2. The RPC

**File:** `supabase/migrations/010_proximity_search.sql`

```sql
CREATE OR REPLACE FUNCTION search_prospects_by_radius(
  center_lat       double precision,
  center_lng       double precision,
  radius_meters    double precision,
  status_filter    text DEFAULT NULL,
  assigned_only    boolean DEFAULT false
)
RETURNS SETOF prospects
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM prospects p
  WHERE p.tenant_id = get_tenant_id()
    AND p.coordinates IS NOT NULL
    AND ST_DWithin(
          p.coordinates,
          ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
          radius_meters
        )
    AND (status_filter IS NULL OR p.status = status_filter)
    AND (NOT assigned_only OR p.assigned_to = auth.uid())
  ORDER BY ST_Distance(
    p.coordinates,
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
  )
  LIMIT 60;
END;
$$;

REVOKE ALL ON FUNCTION search_prospects_by_radius FROM public;
GRANT EXECUTE ON FUNCTION search_prospects_by_radius TO authenticated;
```

Key decisions:
- **`SECURITY DEFINER`** — runs with the function owner's privileges; the `tenant_id = get_tenant_id()` filter is the only gate
- **`STABLE`** — lets the planner cache the result within a single query
- **`LIMIT 60`** — same Anti-Collision rule as the list view
- **Ordered by distance** — closest prospects first
- **`assigned_only` param** — mobile (rufero) passes `true`; web pages pass `false` for telefonista/admin

> Never `GRANT EXECUTE ... TO public` — only to `authenticated`. Anonymous users have no business hitting this.

---

## 3. RLS verification

The RPC bypasses RLS because `SECURITY DEFINER` runs as the owner. The explicit `tenant_id = get_tenant_id()` IS the tenant guard. Write a test migration to prove it:

```sql
-- In a scratch psql session against local supabase:
-- 1. set JWT claim for tenant A
-- 2. call search_prospects_by_radius(...)
-- 3. verify every returned row.tenant_id matches A
-- 4. switch JWT claim to tenant B
-- 5. repeat — verify B's rows only
```

Bake this into `scripts/verify-rls.sh` so it runs in CI on every PR that touches DB.

---

## 4. Right-click on map → Proximity modal

**File:** `apps/web/components/maps/prospects-map.tsx` — extend the map:

```tsx
import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";

export function ProspectsMap({ pins, onProximityRequested, ...rest }: Props) {
  return (
    <Map
      onContextmenu={(e) => {
        if (!e.detail.latLng) return;
        onProximityRequested({
          lat: e.detail.latLng.lat,
          lng: e.detail.latLng.lng,
        });
      }}
      // ... rest unchanged
    />
  );
}
```

`onContextmenu` fires on right-click in vis.gl's Map. Long-press on mobile web fires the same event.

---

## 5. Proximity modal

**File:** `apps/web/components/maps/proximity-search-modal.tsx`

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/lib/constants/prospect-status";
import { proximitySearch } from "@/app/(dashboard)/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  center: { lat: number; lng: number } | null;
  onResults: (prospects: Prospect[], center: { lat: number; lng: number }, radiusMeters: number) => void;
};

const RADII = [
  { label: "5 miles",  meters: 5  * 1609.34 },
  { label: "10 miles", meters: 10 * 1609.34 },
  { label: "25 miles", meters: 25 * 1609.34 },
  { label: "50 miles", meters: 50 * 1609.34 },
];

export function ProximitySearchModal({ open, onOpenChange, center, onResults }: Props) {
  const [radius, setRadius] = useState(RADII[1].meters);
  const [status, setStatus] = useState<string>("any");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!center) return;
    setLoading(true);
    const result = await proximitySearch({
      lat: center.lat,
      lng: center.lng,
      radiusMeters: radius,
      status: status === "any" ? null : status,
    });
    setLoading(false);
    if (result.data) {
      onResults(result.data, center, radius);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proximity search</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Center</label>
            <p className="text-sm text-muted-foreground">
              {center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : "—"}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Radius</label>
            <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RADII.map((r) => (
                  <SelectItem key={r.meters} value={String(r.meters)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Status (optional)</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {PROSPECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSearch} disabled={loading || !center} className="w-full">
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 6. The server action

**File:** `apps/web/app/(dashboard)/actions.ts`

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const proximitySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().positive().max(300_000),  // max 300km sanity cap
  status: z.string().nullable(),
});

export async function proximitySearch(input: z.infer<typeof proximitySchema>) {
  const parsed = proximitySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid search" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_prospects_by_radius", {
    center_lat: parsed.data.lat,
    center_lng: parsed.data.lng,
    radius_meters: parsed.data.radiusMeters,
    status_filter: parsed.data.status,
    assigned_only: false,
  });

  if (error) return { error: error.message };
  return { data };
}
```

Validation is belt-and-suspenders: RLS + RPC guard backend, Zod guards the action, TypeScript guards the call site.

---

## 7. Visual "radius ring" on map while results show

After a proximity search, draw a translucent circle around the center so users can see what they searched:

```tsx
// Inside ProspectsMap, when searchRadius is set:
{searchCenter && searchRadius && (
  <Circle
    center={searchCenter}
    radius={searchRadius}
    fillColor="#E8501F"
    fillOpacity={0.08}
    strokeColor="#E8501F"
    strokeOpacity={0.4}
    strokeWeight={2}
  />
)}
```

`Circle` is from `@vis.gl/react-google-maps`. Expect it to show until the user clears or runs a new filter.

---

## 8. "Near Me" top-bar button

**File:** `apps/web/components/dashboard-shell.tsx` — add to the top bar:

```tsx
<Button variant="outline" size="sm" onClick={handleNearMe}>
  <MapPinIcon className="h-4 w-4 mr-2" /> Near Me
</Button>
```

```tsx
function handleNearMe() {
  if (!navigator.geolocation) {
    toast.error("Geolocation not supported in this browser");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => openProximityModal({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) toast.error("Location permission denied");
      else toast.error("Couldn't get your location");
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}
```

Do NOT auto-trigger on page load — permission prompts without user intent get ignored by the browser and poison future requests.

---

## 9. Wiring results back into the list

Proximity results REPLACE the currently-displayed prospect list and pins. The workspace holds selection + current result set:

```tsx
// prospects-workspace.tsx
const [prospects, setProspects] = useState(initialProspects);
const [proximityCenter, setProximityCenter] = useState(null);
const [proximityRadius, setProximityRadius] = useState(null);

const handleResults = (results, center, radius) => {
  setProspects(results);
  setProximityCenter(center);
  setProximityRadius(radius);
};

// + a "Clear proximity" button that restores initialProspects
```

Keep the initial (URL-filter-driven) list around so clearing proximity goes back to it without a round-trip.

---

## 10. Verification

- [ ] Right-click on map → modal opens with lat/lng pre-filled
- [ ] Select 5-mile radius → prospects within 5 miles appear in list + pins
- [ ] Translucent orange ring shows the searched area
- [ ] "Clear proximity" button restores the filter-driven list
- [ ] "Near Me" button prompts for location, then opens modal
- [ ] With 2 seed prospects 3mi apart: radius = 5mi → both returned; radius = 2mi → only 1
- [ ] Cross-tenant: log in as Tenant B user → proximity search returns 0 rows in Tenant A's footprint

---

## 11. Performance notes

- Expect sub-50ms on 10k rows with the GiST index. If slow, verify the index exists:
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename = 'prospects';
  ```
- First call after a cold DB can be slow (~300ms) while the planner loads. Pre-warm by running a `SELECT 1 FROM prospects LIMIT 1` at server start

---

## 12. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| "function search_prospects_by_radius does not exist" | Migration not applied | `supabase db push` |
| RPC returns 0 rows for the logged-in user | `get_tenant_id()` returning NULL from JWT | Check `auth.users.raw_user_meta_data.tenant_id` matches `users.tenant_id` |
| Slow query even with index | Coordinate column not `geography` | Re-run Stage 1 migration 009 |
| Right-click opens browser menu instead of modal | `onContextmenu` prop wrong or not on root `<Map>` | Put it on the Map component, not a child |
| Results scattered across the globe | `[lat, lng]` vs `[lng, lat]` swap in `ST_MakePoint` | `ST_MakePoint` takes `(lng, lat)` — always |

---

## 13. Mobile contract (locked here)

Stage 5 (mobile map) calls this exact RPC with `assigned_only: true`. Do NOT rename parameters, change return types, or add required params after Stage 2 ships without notifying mobile.
