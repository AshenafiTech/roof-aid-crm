---
# Map View — Selection Sync & Real Home Markers
---

## Purpose

In the Prospects map view, selecting a prospect now has two visible effects:

1. The row in the **left list panel** is prominently highlighted and scrolled into view.
2. The corresponding **home position on the map** is marked with a real, colored pin (enlarged and yellow-ringed when selected). Clicking a pin on the map selects that prospect in the list.

Previously, map view used a Google Maps embed `<iframe>` — which cannot render custom markers or emit click events. We switched to a Leaflet + OpenStreetMap implementation so we own the marker/interaction layer without an API key.

## What changed

### 1. Map engine — Leaflet + OpenStreetMap

- Dependencies added: `leaflet`, `react-leaflet`, `@types/leaflet`
- Chose Leaflet over Google Maps JS API because:
  - No API key / billing setup required (uses OSM tiles)
  - Full control over marker icons, click handlers, camera
  - Leaflet CSS is a single import: `leaflet/dist/leaflet.css`

### 2. `apps/web/components/shared/prospect-map.tsx` — dynamic loader

Rewrote the file as a thin `dynamic(() => import(...), { ssr: false })` wrapper. Leaflet touches `window` on import, so it must only run in the browser. The loader shows a `Loading map…` placeholder during hydration. `parseCoordinates()` stays in this file so other components can reuse it without pulling in Leaflet.

### 3. `apps/web/components/shared/prospect-map-leaflet.tsx` — new

Full client-only map implementation:

- **Status-colored SVG pins** — `STATUS_PIN_COLORS` maps each pipeline status to a hex color (new_leads blue, prospects violet, contacted cyan, scheduled purple, closed_customer emerald, not_viable gray). Pins are built as Leaflet `divIcon`s with inline SVG, so no image assets are needed.
- **Selected pin** — 38px (vs 30) and wrapped in a yellow `#FACC15` ring. `zIndexOffset: 1000` keeps it above neighbors.
- **CameraController** — uses `useMap()`:
  - When `focused` changes, `flyTo` that point at zoom ≥ 15 with a 0.6s ease
  - On first render with no `focused`, `fitBounds` so all pins are visible; tracked via `didInitialFit` ref so the user's pan/zoom is never yanked away again
- **Click → select** — each `Marker` has `eventHandlers={{ click: () => onSelect(id) }}`, propagating selection back to `prospect-list-view.tsx`.
- **Popup** — shows name, address, and human-readable status on marker click.

### 4. `apps/web/components/shared/prospect-list-view.tsx` — two edits

- Wired the map's `onSelect` to the existing selection state:
  ```tsx
  <ProspectMap
    prospects={rows}
    focused={selected}
    onSelect={(id) => setSelectedId(id)}
    className="absolute inset-0"
  />
  ```
- Rebuilt `MapCardItem` active-state styling so the selected row is unmissable:
  - `border-l-primary` + `bg-primary/10` + inset ring `shadow-[inset_0_0_0_1px_var(--primary)]`
  - `MapPin` badge pinned to the top-right corner with primary fill
  - Name goes `font-semibold text-primary`
  - `useRef` + `useEffect` call `scrollIntoView({ block: "nearest", behavior: "smooth" })` so the selected card is always in view when the user clicks a pin on the map

## Files touched

- Added: `apps/web/components/shared/prospect-map-leaflet.tsx`
- Edited: `apps/web/components/shared/prospect-map.tsx` (rewrote as dynamic loader; `parseCoordinates` preserved)
- Edited: `apps/web/components/shared/prospect-list-view.tsx` (map `onSelect` handler; MapCardItem active styling; `useRef` import + `scrollIntoView`)
- Added deps: `leaflet`, `react-leaflet`, `@types/leaflet`

## Decisions & notes

- **Leaflet over Google Maps** — the Google `<iframe>` embed we had is render-only: no markers, no click events. Leaflet gives us both with zero billing surface.
- **OSM tiles, no provider account** — fine for internal tooling. If we hit rate limits in production we can swap the `TileLayer` URL to a paid provider (Mapbox, Stadia, MapTiler) without touching any other code.
- **Pins are inline SVG** — no sprite hosting, no 404s for missing marker assets, and color can key off status directly.
- **Initial fit runs exactly once.** After that, only an explicit focus change moves the camera, so the user's manual pan/zoom is respected.
- **Selected card auto-scrolls into view** — without this, clicking a far-off pin on the map would highlight a row the user can't see.
