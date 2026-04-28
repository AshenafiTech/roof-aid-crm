# Prospects list — return highlight & auto-scroll

## Purpose

When a user taps a prospect, views the detail page, and pops back to the list, briefly highlight the row they just viewed so they can re-orient at a glance. If the row is off-screen (e.g. list scroll position shifted), smoothly scroll it into view first.

## Behavior

1. Tap a prospect → detail page opens (`context.push('/prospects/:id')`).
2. On pop, the corresponding tile:
   - Scrolls into view near the upper third of the viewport (if not already visible in the tree).
   - Its card background tints toward `colorScheme.primary` at 18% alpha (fade-in 260 ms).
   - The tint fades back to the base card color over 900 ms.
3. Tapping a different prospect, or disposing the list, cancels any in-flight highlight.

## Implementation

Two files changed — no new packages, no bloc changes.

### `apps/mobile/lib/features/prospects/presentation/pages/prospects_page.dart`

- Converted `_ProspectsList` from `StatelessWidget` to `StatefulWidget`.
- State owns:
  - `Map<String, GlobalKey> _tileKeys` — stable keys per prospect id (persisted across rebuilds) so `Scrollable.ensureVisible` has a `BuildContext` to target.
  - `String? _recentlyViewedId` — which row is currently highlighted.
  - `Timer? _highlightClearTimer` — clears the highlight after the hold window.
- `_openDetail(p)`:
  1. `await context.push(...)` — waits until the detail page pops.
  2. Guard `mounted` (the tab may be swapped away).
  3. `setState` the id, then in a post-frame callback call `Scrollable.ensureVisible` with `alignment: 0.3` and a 350 ms easeOutCubic curve.
  4. Schedule a 500 ms timer to null out the id, which lets the tile's tween fade the tint back out.

### `apps/mobile/lib/features/prospects/presentation/widgets/prospect_list_tile.dart`

- Added `final bool highlight` (default `false`) to `ProspectListTile`.
- Wrapped the existing `Card` in a `TweenAnimationBuilder<double>`:
  - `end: highlight ? 1.0 : 0.0`
  - Asymmetric duration: 260 ms to fade in, 900 ms to fade out (feels snappy then settles).
  - `Card.color` is `Color.lerp(baseCardColor, primary, t * 0.18)`.
- `baseCardColor` resolves from `theme.cardTheme.color ?? theme.cardColor` so dark mode stays consistent with the rest of the surface.

## Design notes

- **State lives in the list widget, not the bloc.** The highlight is purely a UX affordance — it doesn't survive rotation, process death, or list rebuilds triggered by refresh, which is intentional. Pushing it into `ProspectsBloc` would be overkill.
- **Auto-scroll relies on the tile being in the ListView cache window.** `ListView.builder`'s default `cacheExtent` (~250 logical px) keeps nearby off-screen tiles in the tree, so `Scrollable.ensureVisible` works for the common case. Very distant tiles would need `scrollable_positioned_list` or similar; not worth the dependency here since the user can only tap a visible tile and the list's scroll position is preserved.
- **Interrupting the animation is safe.** `TweenAnimationBuilder` continues from the current value to the new target when `end` or `duration` changes, so rapid tap → back → tap sequences don't produce jumps.

## Tuning knobs

| Constant | Where | Current |
|---|---|---|
| Fade-in duration | tile | 260 ms |
| Fade-out duration | tile | 900 ms |
| Hold (time `highlight == true`) | list | 500 ms |
| Tint strength | tile | `0.18 * primary` over card |
| Scroll alignment | list | `0.3` (upper third) |
| Scroll duration | list | 350 ms, `Curves.easeOutCubic` |
