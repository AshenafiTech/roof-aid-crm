# Import Prospects — Dark Mode Color Fix

## Purpose

The Import Prospects screen (`/new-leads/import`) had several hardcoded
light-theme color utilities that did not render well under dark mode:

- Column Mapping badges showed light-emerald pills that became hard to read
  on a dark background.
- "Will Skip" preview rows used `bg-amber-50/50` plus `text-muted-foreground`
  and `text-amber-600`, which combined to render orange-on-dark text that was
  nearly illegible (most of the row text disappeared and the status reason
  rendered as a clipped orange smear).
- The "New Leads" inline badge in the action bar used a light blue pill
  (`bg-blue-50 text-blue-700`) with no dark variant.
- Summary counters and the Done-step success circle used light-only emerald
  / amber colors.

## Changes

Edited [import-prospects.tsx](../../apps/web/app/(dashboard)/new-leads/import/import-prospects.tsx):

- Added `dark:` variants to all hardcoded color utilities so the component
  reads well in both themes:
  - Mapped column badge: added
    `dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300`.
  - Skipped row background: added `dark:bg-amber-500/5` (the original
    `bg-amber-50/50` is essentially invisible against the dark canvas, but
    we keep it for light mode).
  - Skip-reason text + Ready text: added `dark:text-amber-400` and
    `dark:text-emerald-400` so the status column has enough contrast.
  - "New Leads" inline badge: added
    `dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300`.
  - Summary counters (Valid / Will Skip) and Done-step counters: added
    `dark:text-emerald-400` / `dark:text-amber-400`.
  - File-info spreadsheet icon and Done-step success circle: added matching
    `dark:` variants.

## Notes

- Followed the same `500/10` background + `300/400` foreground pattern that
  Tailwind/shadcn conventions tend to use for "soft" colored chips on dark
  backgrounds. This matches what the rest of the codebase already does for
  semantic badges.
- No structural/behavioral changes — purely styling.
