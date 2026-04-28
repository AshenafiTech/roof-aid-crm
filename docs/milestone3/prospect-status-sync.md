# Prospect Status — Mobile / Web Sync

## Purpose

The mobile app's `prospect_status.dart` had drifted from the web app's
canonical list. Prospects stored with statuses the mobile didn't know
about (e.g. `prospects`, `closed_customer`) were falling through the
`default` case, rendering as generic gray "unknown" tiles and markers.

This change re-syncs mobile to the web's source of truth.

## Canonical List (from web)

Source of truth: [apps/web/lib/constants/prospect-status.ts](apps/web/lib/constants/prospect-status.ts)

Workflow order (entry → terminal):

| #  | Value             | Label              | Accent (web)         | Mobile color | Map hue      |
| -- | ----------------- | ------------------ | -------------------- | ------------ | ------------ |
| 1  | `new_leads`       | New Leads          | `bg-blue-500`        | `#3B82F6`    | `hueAzure`   |
| 2  | `prospects`       | Prospects          | `bg-blue-400`        | `#60A5FA`    | `hueBlue`    |
| 3  | `contacted`       | Contacted          | `bg-sky-500`         | `#0EA5E9`    | `hueCyan`    |
| 4  | `scheduled`       | Scheduled          | `bg-sky-400`         | `#38BDF8`    | `hueOrange`  |
| 5  | `closed_customer` | Closed Customer    | `bg-emerald-500`     | `#10B981`    | `hueGreen`   |
| 6  | `not_viable`      | Not Viable         | `bg-gray-300`        | `#9CA3AF`    | `hueRose`    |

Notes on the small divergences:

- **`not_viable` uses gray-400 (`#9CA3AF`) instead of gray-300 (`#D1D5DB`)**
  — gray-300 was too light on the list tile's 14%-alpha gradient fill to
  read as anything but "empty".
- **Map hues** are constrained to the 12 pre-baked Google Maps hues; the
  mapping picks the closest match per status while keeping all six
  visually distinct on a single map.

## Workflow Rules (informational)

Pulled from `apps/web/lib/auth/permissions.ts`:

- `not_viable` is **terminal** — no transition out of it.
- From `scheduled` → only `closed_customer` or `not_viable` are valid.
- From any other non-terminal status → any status is valid.

Mobile doesn't enforce these yet (M3 is read-only); they'll matter when
status-edit lands in M4.

## Files Changed

| File                                                                          | Change                                 |
| ----------------------------------------------------------------------------- | -------------------------------------- |
| `apps/mobile/lib/core/constants/prospect_status.dart`                         | Full rewrite to match web canon        |
| `apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart` | `_markerHue` switch updated to new statuses |

## Old → New Mapping (for reference)

The prior mobile list was based on a sales-funnel model that no longer
matches the backend:

| Old (gone)           | Rough web equivalent |
| -------------------- | -------------------- |
| `new_leads`          | `new_leads` (kept)   |
| `contacted`          | `contacted` (kept)   |
| `appointment_set`    | `scheduled`          |
| `inspected`          | — (dropped)          |
| `signed`             | `closed_customer`    |
| `not_interested`     | `not_viable`         |

Any prospect records in the DB with the old values should be migrated
at the DB level; the mobile app will now show them as "unknown" status
until the column values are updated.

## Verification

- `flutter analyze` — clean, 0 issues.
- All 6 statuses render their own color on the list tile, status chip,
  and map marker.
