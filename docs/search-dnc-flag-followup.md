# Search, DNC Flag & Follow Up Status Enhancements

## Purpose
Improve prospect search capabilities, DNC (Do Not Call) flagging UX, and add a Follow Up status for better prospect tracking.

## Changes Made

### 1. Enhanced Search (Street & Coordinates)
- **Files**: `lib/queries/prospects.ts`, `components/shared/prospect-list-view.tsx`, `app/(dashboard)/prospects/page.tsx`, `app/(dashboard)/new-leads/page.tsx`
- Search now matches against both `name` and `address` fields using Supabase `.or()` query
- Added a dedicated **Street address** search input in the filter bar
- Added a **Coords** toggle button that reveals latitude, longitude, and radius (km) inputs for coordinate-based proximity filtering
- Coordinate filtering uses client-side haversine distance calculation, stacking with the existing map right-click proximity search

### 2. DNC Flag No Longer Disables Actions
- **File**: `components/shared/prospect-list-view.tsx`
- Call and SMS buttons in both `InlineRowActions` and `ProspectDetailPanel` are **no longer disabled** when a prospect is DNC-flagged
- Instead, tooltips indicate "DNC Flagged" so users are aware but can still take action
- Visual DNC badge and indicators remain unchanged

### 3. DNC Quick-Flag Button on Action Bars
- **File**: `components/shared/prospect-list-view.tsx`
- Added a **DNC toggle button** (PhoneOff icon) to `InlineRowActions` (list row actions)
- Added a **DNC toggle button** with label to `ProspectDetailPanel` (detail view action bar)
- Button shows destructive variant (red) when DNC is active, outline when inactive
- One-click toggle calls `toggleDoNotCall` server action with instant feedback

### 4. Follow Up Status
- **File**: `lib/constants/prospect-status.ts`
- Added `"follow_up"` to `PROSPECT_STATUSES` array (between `contacted` and `scheduled`)
- Added amber color scheme across all status color maps (colors, accents, row bg, bar colors)
- Updated `prospect-map-leaflet.tsx` pin colors (amber `#F59E0B`)
- Updated `pipeline-funnel.tsx` to include Follow Up in the funnel stages
- Updated `lib/queries/analytics.ts` to count follow_up status in conversion metrics

### 5. Wired Flag Dialog
- **File**: `components/shared/prospect-list-view.tsx` (FlagDialog component)
- Replaced placeholder toast-only flag dialog with functional actions:
  - **Follow Up**: Calls `changeStatus` to set prospect status to `follow_up`
  - **Do Not Call**: Calls `toggleDoNotCall` to set the DNC flag with optional reason
  - **Priority** / **Issue**: Display confirmation toast (placeholder for future)
- Added loading state and error handling
- Each flag type shows a description of what it will do

## Important Decisions
- DNC flag is now purely informational — it does not block any calling/messaging actions. Users are warned via tooltips but retain full control.
- The `follow_up` status is a first-class pipeline stage, visible in the funnel, status dropdown, and analytics.
- Coordinate search uses client-side haversine filtering (same as the existing map proximity feature) rather than PostGIS server-side queries, keeping the implementation consistent.
