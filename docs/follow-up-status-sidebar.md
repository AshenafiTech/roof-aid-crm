# Follow Up Status Sidebar Filter

## Purpose
Surface the existing `follow_up` prospect status as a dedicated sidebar entry so users can quickly filter to prospects that have been contacted, booked an appointment, and need a follow-up.

## Background
The `follow_up` status was already defined in `apps/web/lib/constants/prospect-status.ts` (label "Follow Up", amber badge/border/bar). It was selectable from the status dropdown on the prospect detail page and supported by the `changeStatus` / `bulkChangeStatus` server actions, but had no dedicated list page or sidebar entry.

## Changes
- **`apps/web/app/(dashboard)/follow-up/page.tsx`** — new page mirroring `contacted/page.tsx`. Calls `listProspects` with `status: "follow_up"`, applies the same city/state/search/price filters, anti-collision rotation, and `rufero` assignment scoping.
- **`apps/web/app/(dashboard)/nav-items.ts`** — added a "Follow Up" nav item (Lucide `Clock` icon) between "Contacted" and "Scheduled" in the main section. Visible to `owner`, `admin`, `telefonista`, and `rufero` (matches the other status pages).

## How it works
Clicking "Follow Up" in the sidebar navigates to `/follow-up`, which renders `ProspectListView` with `statusFilter="follow_up"` and `showStatusFilter={false}` (the status filter is hidden because the page is already scoped to one status, matching the contacted/scheduled/closed pages).

A prospect lands on this list once a user changes its status to "Follow Up" via the status dropdown on the detail page or via bulk status change. No schema or permissions changes were required — the status enum, badge styling, and `canTransition` rules already cover `follow_up`.

## Files touched
- Added: `apps/web/app/(dashboard)/follow-up/page.tsx`
- Modified: `apps/web/app/(dashboard)/nav-items.ts`

## Follow-up note prompt (follow-up)
Whenever a user moves a prospect into the `follow_up` status, the UI now prompts for a note explaining why. The note is saved on the prospect's notes timeline so context isn't lost.

### Server action
`apps/web/app/(dashboard)/prospects/[id]/actions.ts` — `changeStatus` now accepts an optional `followUpNote` (1–5000 chars). When `status === "follow_up"` and a note is provided, it inserts a row into `notes` (`tenant_id`, `prospect_id`, `author_id`, `body`) and logs a separate `activities` entry of type `note_added` with `metadata.source = "follow_up_status_change"` so the activity timeline shows where the note came from.

### Shared dialog
`apps/web/components/shared/follow-up-note-dialog.tsx` — controlled `FollowUpNoteDialog` with a single `Textarea`. Save is disabled until the note has non-whitespace content. Auto-focuses the textarea, clears state on open. Calls `onSave(note)` so the parent owns the actual `changeStatus` call and pending state.

### Wired call sites
1. **Pipeline tab** (`apps/web/app/(dashboard)/prospects/[id]/pipeline-tab.tsx`) — when the user picks "Follow Up" in the status select, the dialog opens. Save calls `changeStatus({ id, status: "follow_up", followUpNote })`.
2. **List-view detail panel** (`apps/web/components/shared/prospect-list-view.tsx`, `ProspectDetailPanel`) — same pattern for the inline status select on the side panel.
3. **FlagDialog** (`apps/web/components/shared/prospect-list-view.tsx`) — already had a "Reason (optional)" textarea. The follow-up branch now passes `reason.trim()` through as `followUpNote` so the existing reason becomes the prospect note. Reason stays optional here since users sometimes flag in bulk and revisit later.

### Why a separate dialog instead of just extending FlagDialog
The pipeline tab and list-view side panel use a `Select` for status — there's no existing dialog there. Routing those flows through `FlagDialog` would have re-opened a generic flag picker mid-status-change, which is confusing. A small focused dialog keeps the path: pick "Follow Up" → write note → done.

### Note for ruferos
`canTransition` blocks ruferos from setting `follow_up` (only `closed_customer`/`not_viable` from `scheduled`), so the dialog is unreachable for that role and no extra permission gate is needed.
