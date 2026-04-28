# Map: list click centers marker and opens detail bubble

## Purpose

When a user clicks a prospect in the left-hand list (Map view) we want the
right-hand map to:

1. Center the marker in the **visible** portion of the map (not behind the
   bottom detail overlay).
2. Open the on-marker InfoWindow popup so the prospect's name / address /
   status appear right at the pin, in addition to the existing bottom
   detail panel.

Previously only the marker's "selected" ring updated and the camera nominally
panned to the marker, but because the bottom detail overlay can cover up to
50% of the map, the marker often landed under the panel and the InfoWindow
only opened for direct marker clicks — making list selections feel broken.

## Changes

- `apps/web/components/shared/prospect-map-google.tsx`
  - `GoogleMapInner` now syncs its internal `popupId` with the externally
    controlled `focused.id` via a `useEffect`. Selecting a prospect from the
    list opens its InfoWindow at the pin; closing the InfoWindow keeps the
    selection (because `focused.id` doesn't change).
  - `CameraController` accepts a new `bottomInset` prop (px). After
    `setCenter` on the focused location it calls `panBy(0, bottomInset / 2)`
    so the marker shifts upward into the visible area above the overlay.
    A `bottomInsetRef` keeps the latest value without retriggering the
    centering effect when the user merely toggles the overlay open/closed.

- `apps/web/components/shared/prospect-map.tsx`
  - Forwards an optional `bottomInset` prop to the inner map.

- `apps/web/components/shared/prospect-list-view.tsx`
  - Passes `bottomInset={selected && !overlayHidden ? 280 : 0}` to
    `ProspectMap`. 280 px is a reasonable estimate for the compact detail
    panel; the marker lands ~140 px above true center, keeping it in view.

## Behavior

- Click a row → marker becomes selected (yellow ring), map centers on the
  marker above the detail overlay, and the InfoWindow opens at the pin.
- Click another row → marker switches; map re-centers; InfoWindow follows.
- Hide the detail panel via `X` → camera does **not** jump back; only the
  next focus change re-centers.
- Marker click on the map continues to behave as before (sets selection,
  opens InfoWindow, shows detail panel).
- Right-click to start a proximity search (or clicking **Search** to commit
  one) clears any focused prospect first via `onSelect(null)`, so the
  camera fits to the proximity circle instead of staying anchored on the
  previously-selected pin. `onSelect` accepts `string | null` end-to-end.
