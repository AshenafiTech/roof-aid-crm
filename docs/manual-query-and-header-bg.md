# Manual Query Apply + Solid List Header Background

## Purpose

Two UX changes to the prospects / new-leads listing:

1. **Stop auto-fetching on every filter change.** Filter selections (city,
   state, status, price range, custom price, search text, and Clear) now
   stage into a local "draft" state. Nothing hits the database until the
   user clicks **Query Database**. This lets a rep apply several criteria
   at once without triggering a round-trip per selection.
2. **List view column header is no longer semi-transparent.** The sticky
   header row now has a solid background so rows scrolling underneath
   can't be seen through it.

## Scope

All changes in `apps/web/components/shared/prospect-list-view.tsx`.

## Changes

### Draft-based filtering

- Added a `draft: URLSearchParams` state that initializes from the current
  URL and re-syncs via `useEffect` whenever the applied URL
  (`useSearchParams` output) changes — so after a successful query, the
  draft matches what was applied.
- New `setDraftParam(key, value)` helper mirrors the previous `setParam`
  signature but only mutates the draft; the existing `setParam` now
  delegates to it so the Select `onValueChange` handlers keep their
  shape.
- All UI reads (`city`, `stateParam`, `status`, `q`, `priceMin`,
  `priceMax`, `hasFilters`, `matchPriceRange`) are sourced from `draft`,
  so inputs show the pending selection, not the applied one.
- The **search input** is now controlled (`value={q}` +
  `onChange` → `setDraftParam("q", ...)`) so it stays in sync when the
  user clicks **Clear** or after a query is applied. Submitting the
  search form (Enter) calls `applyDraft()`.
- The **Clear** button now resets the draft only (`setDraft(new
  URLSearchParams())`) — no push, no fetch.
- The **price range select** and **custom-range form** write to draft
  only; the form's Clear button clears draft `priceMin`/`priceMax`.
- New `applyDraft()` pushes `draft` to the URL (dropping any `load`
  pagination param). If the normalized draft equals the normalized
  applied URL, it falls back to `router.refresh()` so the button still
  re-runs the query on an unchanged filter set.
- **Query Database** now calls `applyDraft()`. When the draft differs
  from the applied URL, the button gets a primary-colored ring and a
  small yellow dot as an "unapplied filters" indicator.

### Pagination left alone

`loadMore` still calls `router.push` directly — pagination is not a
filter stage, and making the user click Query Database after every "Load
N More" would be worse UX.

### Header background

- List-view column header at line ~495: `bg-muted/40` → `bg-muted`.
  The header is `sticky top-0`, and at 40% opacity the scrolling rows
  were visible through the labels.

## Verification

- `npx tsc --noEmit` passes from `apps/web`.
- Manual sanity: staging multiple filters no longer spams server actions;
  the ring/dot on Query Database appears when the draft diverges and
  clears after the query is applied.

## Notes / Follow-ups

- The yellow dot is intentionally subtle (`h-1.5 w-1.5`). If we want a
  stronger signal, consider a "Filters changed" pill next to the button.
- If we add keyboard shortcuts, binding **Enter** in any filter field to
  `applyDraft()` (the search input already does this) would be a natural
  extension.
