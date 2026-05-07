# Missing Number Banner Positioning Fix

## Purpose

The "Your business line isn't set up yet" warning banner
(`MissingNumberBanner`) rendered correctly on most dashboard pages but looked
broken on prospect listing pages (`/prospects/all-leads`, `/prospects/new-leads`,
`/prospects`, etc.):

- Listing pages use `ProspectListView`, which escapes the dashboard's
  `px-4 py-6` content wrapper with negative margins (`-mx-4 -mt-6 -mb-6`)
  and forces a viewport-locked height of `calc(100vh - 3.5rem)`.
- The banner sat **inside** that same padded wrapper, so its amber
  background showed up as a centered, gutter-bound block rather than a
  full-bleed bar.
- The list view's hardcoded `100vh - 3.5rem` height did not account for
  the banner's height, so the table extended below the viewport and
  produced a second outer scrollbar.

## Changes

1. **`DashboardShell` accepts a `banner` slot** (`apps/web/app/(dashboard)/dashboard-shell.tsx`).
   The banner now renders as a sibling of `<main className="page">`,
   between the topbar and the scrollable content area, so it spans the
   full width of the main column.

2. **Layout passes the banner via the new prop** (`apps/web/app/(dashboard)/layout.tsx`)
   instead of including it inside `children`.

3. **Content wrapper is now a flex column with `min-h-full`**
   (`flex min-h-full flex-col px-4 py-6 sm:px-6`). This lets full-height
   pages opt into filling the available space without hardcoding viewport
   math.

4. **`ProspectListView` uses `flex-1 min-h-0`** instead of
   `style={{ height: "calc(100vh - 3.5rem)" }}`
   (`apps/web/components/shared/prospect-list-view.tsx`). The list now
   adapts automatically whether or not the banner is present.

## Notes

- Banner visibility is unchanged: still only shown when the tenant has
  zero active phone numbers. Other roles still see a read-only message;
  owners/admins/super_admins still get the "Set it up" CTA.
- Non-list dashboard pages render normally — the new wrapper still uses
  the same `px-4 py-6 sm:px-6` padding and content stacks as before. The
  added `min-h-full flex flex-col` only matters for pages that explicitly
  use `flex-1` to fill remaining height.
