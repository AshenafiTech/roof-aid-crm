# Dashboard Layout Redesign

## Purpose
Redesign the dashboard page to match the client spec — a split-panel workspace with prospect list on the left and Google Map on the right, with inline filters at the top.

## Layout Structure

```
+-------------------------------------------------------+
| City: [v]  Status: [v]  | Search: [...........] [Query Database] |
+------------------+------------------------------------+
|  X de Y prospects|                                    |
|  +-- Prospect 1 -|          Google Map                |
|  +-- Prospect 2 -|          (embedded iframe)         |
|  +-- Prospect 3 -|                                    |
|  +-- Prospect 4 -|                                    |
|  ...             |                                    |
|  [Load 60 More]  |                                    |
+------------------+------------------------------------+
```

## Components

### ProspectWorkspace (`prospect-workspace.tsx`)
- Full-height workspace filling the dashboard content area
- **Filter bar** at top: City dropdown, Status dropdown, search input, "Query Database" button
- **Left panel** (~380px): Scrollable prospect list with dividers, "Load 60 More" at bottom
- **Right panel** (flex-1): Google Maps iframe embed centered on Kansas (37.7, -97.3)
- Empty state: "Start Your Search" prompt with icon and description
- Map overlay shows "Awaiting search results" when no results

### ProspectListCard (`prospect-list-card.tsx`)
- Flat list item (no Card wrapper) with left accent border by status
- Shows name, status badge, location, phone, assignee
- DNC indicator for flagged prospects

## Files Modified
- `apps/web/app/(dashboard)/page.tsx` — Simplified to workspace-only layout
- `apps/web/app/(dashboard)/prospect-workspace.tsx` — Full redesign
- `apps/web/app/(dashboard)/prospect-list-card.tsx` — Flattened for list context

## Notes
- The Google Maps iframe uses a placeholder embed centered on Wichita, Kansas
- In M3, this will be replaced with the `@googlemaps/js-api-loader` library for interactive pins
- The workspace uses negative margins to fill the dashboard shell edge-to-edge
