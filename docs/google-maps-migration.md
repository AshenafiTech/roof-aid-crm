# Google Maps Migration

## Purpose

Replaced the Leaflet-based prospect map with Google Maps. The Google
ecosystem gives us higher-quality satellite imagery, better address-level
zoom, and a smoother interaction model than the OSM/Esri tile combo we
were using.

## Library

`@vis.gl/react-google-maps` — Google's officially maintained React
bindings for the Maps JavaScript API. Lightweight, modern, and supports
declarative `<Map>`, `<Marker>`, `<InfoWindow>`, `<Circle>`, and the
`useMap()` hook for imperative camera control.

`@types/google.maps` is added as a dev dependency so we can type
`google.maps.Icon`, `google.maps.Size`, etc. when building the marker
icons.

## Configuration

Add to `apps/web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your-api-key>
```

The slot already exists in `.env.example`. Because the var is
`NEXT_PUBLIC_*`, it is exposed to the browser — restrict the key in the
Google Cloud Console:

- HTTP referrer restriction → your prod domain + `localhost:*` for dev.
- API restriction → only the **Maps JavaScript API**.

If the var is missing at runtime, the map renders a friendly placeholder
instead of crashing.

## Files

- `apps/web/components/shared/prospect-map.tsx` — wrapper that dynamically
  imports the client-only Google component.
- `apps/web/components/shared/prospect-map-google.tsx` — new
  implementation. Replaces `prospect-map-leaflet.tsx` (deleted).

## Feature Parity

Everything the Leaflet map did, the Google map does:

| Feature | Leaflet | Google |
| --- | --- | --- |
| Status-colored pins | SVG DivIcon | SVG data URI on `Marker.icon` |
| Selected pin ring | inline SVG `<circle>` | inline SVG `<circle>` |
| Camera fit to all points | `fitBounds` | `fitBounds`, capped at zoom 13 |
| Fly-to focused | `flyTo` | `panTo` + `setZoom(>=15)` |
| Tile layer toggle | `LayersControl` Street/Satellite | Built-in `mapTypeControl` |
| Right-click radius search | `useMapEvents.contextmenu` | `<Map onContextmenu>` |
| Proximity circle | `<Circle>` | `<Circle>` |
| Marker click popup | `<Popup>` | `<InfoWindow>` |

## Removed

- `leaflet` and `react-leaflet` npm dependencies.
- `apps/web/components/shared/prospect-map-leaflet.tsx`.

## Notes

- Uses the legacy `<Marker>` rather than `<AdvancedMarker>` so we don't
  need to provision a Map ID in Google Cloud. If we eventually want
  HTML-based pins or vector map styling, switch to `<AdvancedMarker>` and
  add `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
- The Maps JS API is loaded once via `<APIProvider>`. Multiple `<Map>`
  instances on the same page (none today) would share the loader.
