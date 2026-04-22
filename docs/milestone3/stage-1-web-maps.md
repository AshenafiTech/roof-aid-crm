# Stage 1 — Web Map Integration on Dashboard

**Goal:** Add a live Google Map to the dashboard that renders one color-coded pin per prospect in the current filter. Clicking a pin highlights its card in the list.

**Outcome:** When Stage 1 is done, the dashboard becomes spatial. A Telefonista can visually verify where their prospects are clustered without reading 60 addresses.

**Estimated time:** 1.5 days

---

## 1. Dependencies

Install in `apps/web`:

```bash
pnpm add @vis.gl/react-google-maps
```

> Use `@vis.gl/react-google-maps` (official Google Maps team React bindings) — not the legacy `@react-google-maps/api`. It supports React 19, Server Components, and the latest Advanced Markers API.

---

## 2. Environment

Add to `apps/web/.env.local` (and `.env.example`):

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...        # browser-restricted key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=abc123          # required for Advanced Markers
GOOGLE_MAPS_SERVER_KEY=AIza...                 # server-only (geocoding), never exposed
```

Restrictions in Google Cloud Console:
- Browser key: HTTP referrers: `localhost:3000/*`, `staging-domain/*`, `prod-domain/*`. APIs allowed: Maps JavaScript API only
- Server key: IP restricted to Vercel egress / Supabase edge. APIs allowed: Geocoding API only

---

## 3. Database prep — coordinates as `geography`

Create migration `supabase/migrations/009_coordinates_geography.sql`:

```sql
-- Convert prospects.coordinates from point to geography(Point, 4326)
-- Required for ST_DWithin with meter-accurate radius in Stage 2.

ALTER TABLE prospects
  ALTER COLUMN coordinates TYPE geography(Point, 4326)
  USING CASE
    WHEN coordinates IS NULL THEN NULL
    ELSE ST_SetSRID(ST_MakePoint(coordinates[0], coordinates[1]), 4326)::geography
  END;

CREATE INDEX IF NOT EXISTS idx_prospects_coordinates
  ON prospects USING GIST (coordinates);
```

Apply, then verify:

```sql
SELECT pg_typeof(coordinates) FROM prospects LIMIT 1;
-- expected: geography
```

> Run this migration BEFORE any map code is merged. Stage 2 will fail without it.

---

## 4. Map provider at the layout level

**File:** `apps/web/app/(dashboard)/layout.tsx`

Wrap the dashboard tree in `APIProvider` once so any page can mount a `<Map />`:

```tsx
import { APIProvider } from "@vis.gl/react-google-maps";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      {/* existing sidebar + topbar shell */}
      {children}
    </APIProvider>
  );
}
```

---

## 5. `ProspectsMap` component

**File:** `apps/web/components/maps/prospects-map.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { PROSPECT_STATUS_PIN_COLORS, type ProspectStatus } from "@/lib/constants/prospect-status";

type Pin = {
  id: string;
  name: string;
  status: ProspectStatus;
  lat: number;
  lng: number;
};

type Props = {
  pins: Pin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ProspectsMap({ pins, selectedId, onSelect }: Props) {
  return (
    <div className="relative h-[calc(100vh-12rem)] rounded-lg overflow-hidden border">
      <Map
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
        defaultZoom={10}
        defaultCenter={{ lat: 32.78, lng: -96.8 }}  // fallback: Dallas
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        <AutoFit pins={pins} />
        {pins.map((p) => (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => onSelect(p.id)}
          >
            <Pin color={PROSPECT_STATUS_PIN_COLORS[p.status]} selected={p.id === selectedId} />
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
}

function Pin({ color, selected }: { color: string; selected: boolean }) {
  return (
    <div
      className={`w-5 h-5 rounded-full border-2 border-white shadow-md transition-all ${
        selected ? "scale-150 ring-2 ring-offset-1 ring-primary" : ""
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

function AutoFit({ pins }: { pins: Pin[] }) {
  const map = useMap();
  const lastSigRef = useRef<string>("");

  useEffect(() => {
    if (!map || pins.length === 0) return;
    const sig = pins.map((p) => p.id).sort().join(",");
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
  }, [map, pins]);

  return null;
}
```

Key points:
- `AutoFit` re-fits bounds only when the **set of pin ids** changes — not on every re-render (prevents jumpy zoom during filter typing)
- `AdvancedMarker` is DOM-based, so pin styling is plain CSS. No legacy `Icon` API
- Selected pin scales up and gets a ring — visual confirmation of list/map sync

---

## 6. Status → pin color map

**File:** `apps/web/lib/constants/prospect-status.ts` — add to the existing file:

```ts
export const PROSPECT_STATUS_PIN_COLORS: Record<ProspectStatus, string> = {
  new_leads:        "#3b82f6",  // blue
  prospects:        "#a855f7",  // purple
  contacted:        "#eab308",  // yellow
  scheduled:        "#f97316",  // orange (roof-aid brand)
  closed_customer:  "#22c55e",  // green
  not_viable:       "#6b7280",  // gray
};
```

Keep these values in **sync with the badge colors** used in Stage 1 of M2 — same semantic meaning, different rendering surface.

---

## 7. Wire into the prospects list page

**File:** `apps/web/app/(dashboard)/prospects/page.tsx`

The list page already fetches prospects server-side in M2. Add the map as a right-side panel using a client component for selection state:

```tsx
// prospects-workspace.tsx (new client component)
"use client";

import { useState } from "react";
import { ProspectsMap } from "@/components/maps/prospects-map";
import { ProspectCard } from "@/components/shared/prospect-card";

export function ProspectsWorkspace({ prospects }: { prospects: Prospect[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pins = prospects
    .filter((p) => p.coordinates)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      lat: p.coordinates!.lat,
      lng: p.coordinates!.lng,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-2">
        {prospects.map((p) => (
          <ProspectCard
            key={p.id}
            prospect={p}
            highlighted={p.id === selectedId}
            onClick={() => setSelectedId(p.id)}
            scrollIntoView={p.id === selectedId}
          />
        ))}
      </div>
      <div className="lg:col-span-3">
        <ProspectsMap pins={pins} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </div>
  );
}
```

Then in the server page:

```tsx
<ProspectsWorkspace prospects={data ?? []} />
```

---

## 8. Coordinates serialization (server → client)

PostGIS `geography` serializes through PostgREST as GeoJSON. Normalize in a helper:

**File:** `apps/web/lib/geo.ts`

```ts
export function toLatLng(coords: unknown): { lat: number; lng: number } | null {
  if (!coords || typeof coords !== "object") return null;
  const c = coords as { coordinates?: [number, number] };
  if (!c.coordinates || c.coordinates.length !== 2) return null;
  const [lng, lat] = c.coordinates; // GeoJSON is [lng, lat]
  return { lat, lng };
}
```

Use in the page:

```ts
const pins = prospects
  .map((p) => ({ ...p, coordinates: toLatLng(p.coordinates) }))
  .filter((p) => p.coordinates);
```

> GeoJSON ordering is `[lng, lat]`. Getting this backwards is the #1 "pins landing in the wrong ocean" bug. Always destructure explicitly.

---

## 9. ProspectCard: highlight + scroll

Extend the existing `ProspectCard` (built in M2) with a `highlighted` prop and a `scrollIntoView` effect:

```tsx
"use client";
import { useEffect, useRef } from "react";

export function ProspectCard({ prospect, highlighted, onClick, scrollIntoView }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollIntoView && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollIntoView]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        highlighted ? "ring-2 ring-primary shadow-md" : "hover:bg-muted/30"
      }`}
    >
      {/* existing card content */}
    </div>
  );
}
```

---

## 10. Loading skeleton

Show a map-shaped skeleton while the Google Maps JS bundle loads:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// inside layout or page:
<Skeleton className="h-[calc(100vh-12rem)] rounded-lg" />
```

`APIProvider` handles the async script load — the `<Map />` renders itself transparently once ready. No custom loading state needed inside the component.

---

## 11. Verification

- [ ] Refresh `/prospects` → map renders within 1s of page load
- [ ] 15 seed prospects → 15 pins visible on map
- [ ] Filter by status "New Leads" → pins shrink to blue only
- [ ] Click a pin → corresponding card gets ring + scrolls into view
- [ ] Click a card → corresponding pin scales up
- [ ] Zoom/pan works; pinch on trackpad works
- [ ] No browser console errors referencing the Maps API key
- [ ] Prospects without coordinates do NOT render as `(0,0)` pins (they're filtered out)

---

## 12. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pins at `(0, 0)` off the coast of Africa | `[lng, lat]` vs `[lat, lng]` swap | Use `toLatLng()` helper |
| "This page can't load Google Maps correctly" dev warning | Billing not enabled on GCP project | Enable billing; $200 free tier covers dev |
| Map blank, no errors | Missing `mapId` (required for Advanced Markers) | Create a Map ID in GCP → Maps Styles |
| Map zooms to entire world every keystroke | `AutoFit` re-runs on every render | Confirm the `lastSigRef` signature guard is in place |
| Server component can't use `ProspectsMap` | It's a client component by design | Mount it inside a client workspace wrapper |

---

## 13. Follow-ups (pushed to Stage 2)

- Right-click → Proximity Search modal (Stage 2)
- "Near Me" top-bar button (Stage 2)
- Clustering when zoom-out shows >100 pins (M9 polish)
