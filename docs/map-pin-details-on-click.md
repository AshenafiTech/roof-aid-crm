# Map Pin Details on Click Only

## Purpose

Pin detail (name, address, status) should appear only when the user
clicks a marker, not on hover and not by default. With many loaded
prospects now rendering as pins, hover tooltips were noisy and
permanent tooltips would be unreadable.

## Scope

`apps/web/components/shared/prospect-map-leaflet.tsx`.

## Change

Swapped `Tooltip` for `Popup` on the marker. Leaflet `Popup`s open on
marker click and close when dismissed or another popup opens — exactly
the "click-only" behavior requested.

- Import: `Tooltip` → `Popup` from `react-leaflet`.
- Wrapped the same name/address/status block in `<Popup offset={[0,
  -28]}>`. Content unchanged.

The existing `eventHandlers.click → onSelect(id)` still fires, so a
click both opens the popup *and* selects the row in the list panel /
detail overlay.

## Verification

- `npx tsc --noEmit` passes from `apps/web`.
- Manual: pins now show no label by default; clicking opens a popup
  with the prospect's name, address, and status, and simultaneously
  selects the row in the left panel.
