# Preserve Prospect Position When Returning From Detail Page

## Purpose

Reps reported that after opening a prospect's detail page, taking an action,
and going back, they were dropped at the top of the list and had to hunt for
the row they were just on. URL filters (`?city=...&state=...`) already came
back with the browser back button, but the **scroll position** and **which
row was clicked** were lost.

## Scope

- `apps/web/lib/hooks/use-last-viewed-prospect.ts` — new hook + helper.
- `apps/web/components/shared/prospect-list-view.tsx` — record on click,
  attach `data-prospect-id`, restore on mount.
- `apps/web/app/(dashboard)/prospects/[id]/back-button.tsx` — new "Back"
  button on the detail page header.
- `apps/web/app/(dashboard)/prospects/[id]/page.tsx` — render the back button.
- `apps/web/app/globals.css` — flash highlight animation.

## How It Works

### Recording

When the user clicks a prospect Link in the list (Full Profile, Edit, Add
Note buttons in the panel), `rememberLastViewedProspect(id)` writes the ID
to `sessionStorage` under key `roofaid-last-viewed-prospect`.

### Restoring

`useRestoreLastViewedProspect()` is called inside `ProspectListView`. On
mount (and whenever the rendered row count or view mode changes), it:

1. Reads the stored ID from `sessionStorage`.
2. Finds the matching DOM node via `[data-prospect-id="<id>"]`.
3. Removes the storage key (so subsequent renders don't re-flash).
4. Scrolls the element into view and applies `prospect-row-flash` for ~1.6s.

The flash class triggers a CSS keyframe animation that fades from a primary
tint with an inset border back to transparent.

### Back Button

`BackToProspectsButton` lives in the detail page header. On click:

- If `document.referrer` is from the same origin and there's history to
  pop, calls `router.back()`. This preserves the URL filters the user had
  on the list and pairs with the `sessionStorage` restore.
- Otherwise (deep-linked, refreshed tab), navigates to `/prospects`.

## Notes / Future Work

- `apps/web/app/(dashboard)/prospects/prospect-table.tsx` defines a
  `ProspectTable` component that is not imported anywhere. It was not wired
  up; if it's ever rendered again, the same hook + `data-prospect-id`
  treatment should be applied to its `<TableRow>`.
- The flash uses `var(--primary)` so it picks up the active theme.
- `sessionStorage` (not `localStorage`) is intentional — the position
  should not survive across browser sessions.
