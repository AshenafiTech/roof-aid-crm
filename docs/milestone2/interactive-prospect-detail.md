# Interactive Prospect Detail Panels

## Purpose
Make prospect lists interactive so users can view full details, take actions, and see map context without navigating away from the list page. Applies to both New Leads and Prospects pages.

## Changes

### 1. Map View — Click-to-Focus with Detail Overlay
- Clicking a prospect card in the left panel sets it as `selectedId`
- The map re-centers on the selected prospect's coordinates
- A `ProspectDetailPanel` overlay appears at the bottom of the map panel (compact mode)
- Clicking another prospect updates both the map center and the detail panel

### 2. List View — Expandable Rows with Embedded Map
- Clicking a row toggles inline expansion (chevron indicator)
- Expanded row shows a full `ProspectDetailPanel` including an embedded Google Maps iframe centered on that prospect's coordinates with a city label overlay
- Only one row can be expanded at a time

### 3. Visual Improvements
- **Avatar initials** on every card and row for visual identity
- **Tooltips** on all action buttons for discoverability
- **Copy-to-clipboard** buttons on phone numbers and email
- **Search icon** inside the search input field
- **Clear selection** button in the toolbar
- **DNC callout box** with reason and date when Do Not Call is flagged
- **Colored section headers** with branded icon circles
- **Responsive column hiding** on smaller screens (md/lg breakpoints)
- **Inline map label** showing the city name overlaid on the embedded map

### 4. ProspectDetailPanel Component

**Header section:**
- Avatar with initials, name, status badge, DNC indicator
- Full address with map pin icon
- Assigned user, created date, data source metadata row
- Link to full profile page

**Quick action toolbar:**
- Call (primary button, disabled if DNC with tooltip explaining why)
- SMS (disabled if DNC)
- Email
- Schedule appointment
- Divider
- Edit, Assign Rufero, Navigate, Notes, Flag (ghost buttons)

**Three-card detail grid:**

**Contact Card:**
- Primary phone (with copy button)
- Secondary phone if available (with copy button)
- Email address (with copy button)

**Property Card:**
- Full address (with copy button for complete location)
- City / State / ZIP
- Home value and hail size (side by side, bold)
- Property type and source (side by side)

**Status & Assignment Card:**
- Status dropdown with **working server action** — changes persist via `changeStatus()`
- Assigned user with avatar
- Assignment date
- Tags displayed as badges
- DNC reason callout with date (if applicable)

**Inline map (list view only):**
- 224px height Google Maps embed
- City label overlay in top-left corner

### 5. Server Actions Integration
- Status changes from the inline dropdown call `changeStatus()` from `prospects/[id]/actions.ts`
- Shows loading spinner during status transition
- Toast notifications for success/error
- Path revalidation keeps the list in sync

### 6. SMS & Email Popup Dialogs
Clicking SMS or Email on a prospect opens a pre-filled dialog instead of a coming-soon toast:

**SMS Dialog (`SmsDialog`):**
- Shows prospect avatar, name, and phone number
- Read-only "To" field pre-filled with prospect's primary phone
- Message textarea with character counter (1600 max)
- Send button (disabled if no phone number on file)
- Cancel/close dismisses without sending

**Email Dialog (`EmailDialog`):**
- Shows prospect avatar, name, and email
- Template selector: Manual, Project Follow-up, Introduction
- Templates auto-fill subject and body with prospect's name and city
- Read-only "To" field pre-filled with prospect's email
- Subject and message fields
- Send button (disabled if no email on file)

Both dialogs show a toast on send confirming the message was queued, noting Telnyx/SendGrid integration arrives in M4.

### 7. Assign Rufero Dialog
Clicking "Assign" on a prospect opens a dialog to reassign the rufero directly from the list/map view:

**AssignDialog:**
- Shows prospect avatar, name, and current assignee
- Lazy-loads the list of active ruferos from the server on open
- Dropdown with all active ruferos + "Unassigned" option
- Calls `assignProspect()` server action on selection
- Shows loading spinner during assignment
- Toast notification on success/error
- Server action includes permission check (owner/admin only)

**Server action added:**
- `listRuferos()` in `prospects/[id]/actions.ts` — fetches active ruferos for the current tenant

### 8. Advanced Filters & List View Improvements

**New filters added to the filter bar:**
- **State filter** — dropdown populated from distinct `state` values in the database
- **Price range filter** — toggle button reveals min/max inputs for `home_value`, applies on blur or Enter key
- Active price filter shows a compact badge on the button (e.g. "50000–200000")

**Server-side query updates (`lib/queries/prospects.ts`):**
- Added `state`, `priceMin`, `priceMax` to `ProspectFilters` type
- Query applies `.eq("state", ...)`, `.gte("home_value", ...)`, `.lte("home_value", ...)` when set
- Added `listStates()` function to fetch distinct state values

**List view column header:**
- Sticky header row with columns: Name, Address, Status, Assigned, Hail, Value
- Matches the layout of `ListRowItem` rows for visual alignment
- Responsive: Address hidden below `md`, Assigned hidden below `lg`, Hail/Value hidden below `sm`

**Persistent view mode:**
- Map/List toggle saved to `localStorage` under key `roofaid-view-mode`
- On page load, restores the last selected view mode
- Persists across page navigations and browser sessions

## Files Modified
- `apps/web/components/shared/prospect-list-view.tsx` — Full rewrite with improved styling, server actions, SMS/Email dialogs, assign dialog, filters, column header, persistent view mode
- `apps/web/lib/queries/prospects.ts` — Added state/price filters, `listStates()` query
- `apps/web/app/(dashboard)/prospects/page.tsx` — Passes `states`, reads `state`/`priceMin`/`priceMax` search params
- `apps/web/app/(dashboard)/new-leads/page.tsx` — Passes `states`, reads `state`/`priceMin`/`priceMax` search params

## Files Created
- `apps/web/components/ui/tooltip.tsx` — shadcn/ui tooltip component (added via CLI)

## Dependencies
- `@radix-ui/react-tooltip` — for tooltip primitives (added automatically with shadcn)
