# Inline Prospect Actions & Bulk Operations

## Purpose

Add quick-action buttons, expanded data columns, and bulk operations to the prospect list view, so users can take action on individual or multiple prospects without expanding each row.

## What Was Done

### 1. Expanded Columns (List View)

| Column | Width | Breakpoint | Notes |
|--------|-------|------------|-------|
| (checkbox) | 16px | always | Select/deselect row for bulk actions |
| (expand) | 14px | always | Chevron to expand row detail |
| Name | 150px | always | Includes DNC badge inline |
| Phone | 120px | lg+ | First phone number |
| Email | 160px | xl+ | Prospect email |
| Address | flex | md+ | Full address + city, state |
| Status | 90px | always | StatusBadge component |
| Assigned | 100px | lg+ | Assigned user name |
| Source | 70px | xl+ | Data source |
| Hail | 40px | sm+ | Hail size in inches |
| Value | 80px | sm+ | Home value formatted |
| Actions | 228px | sm+ | 7 action buttons (prospects only) |

### 2. Inline Action Buttons (Per Row, Prospects Only)

7 icon buttons: Call, SMS, Email, Schedule, Assign, Navigate, Flag.
DNC compliance: Call and SMS disabled for DNC-flagged prospects.

### 3. Bulk Actions

Checkbox selection enables a "Bulk Actions" dropdown in the summary bar:

| Action | Description |
|--------|-------------|
| **Assign Rufero** | Submenu lists active ruferos + Unassign option |
| **Change Status** | Submenu with all prospect statuses |
| **Mark Do Not Call** | Sets `do_not_call = true` on all selected |
| **Remove DNC Flag** | Clears DNC on all selected |
| **Delete** | Permanently deletes selected (admin/owner/super_admin only, with confirm dialog) |

**Selection UX:**
- Select-all checkbox in the column header toggles all visible rows
- Per-row checkbox; checked rows get a `bg-primary/5` highlight
- Summary bar shows "{N} selected" with Bulk Actions dropdown + Deselect all
- Spinner shown during bulk operations
- Selection clears after successful bulk action

### Files Modified

- `apps/web/components/shared/prospect-list-view.tsx`
  - `BulkActionsMenu` — dropdown with assign, status change, DNC toggle, delete
  - `ListRowItem` — added `isChecked` / `onCheck` props, checkbox column
  - Column header — select-all checkbox
  - State: `checkedIds` Set, `toggleChecked`, `toggleAll`, `clearChecked`

- `apps/web/app/(dashboard)/prospects/[id]/actions.ts`
  - `bulkAssign()` — assigns/unassigns rufero for multiple prospects
  - `bulkChangeStatus()` — changes status for multiple prospects
  - `bulkDelete()` — deletes prospects (admin/owner/super_admin only)
  - `bulkToggleDnc()` — sets or clears DNC flag on multiple prospects
  - All bulk actions log activities with `bulk: true` metadata
  - All limited to 500 IDs per call
