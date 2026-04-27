# Prospect detail — Property card 2-column stat grid

## Purpose

Client wanted the prospect overview to fit on one screen without scrolling. The Property card previously rendered all fields vertically, which was the biggest contributor to vertical space. This change compacts the three short "stat" fields into a 2-column grid while keeping Address full-width (since it wraps to 2–3 lines).

## Layout

```
┌─────────── PROPERTY ───────────┐
│ 📍 Address                     │
│    123 Main St                 │
│    Austin, TX 78701            │
│                                │
│ ☁ HAIL SIZE      💲 HOME VALUE │
│ 0.75 in          $250,000      │
│                                │
│ 🎯 COORDINATES                 │
│ 30.26715, -97.74306            │
└────────────────────────────────┘
```

## Implementation

File: [overview_tab.dart](../apps/mobile/lib/features/prospects/presentation/widgets/tabs/overview_tab.dart)

- Address keeps using `_KeyValue` (icon + label + value in a horizontal row) because the value is multi-line.
- The other three fields — Hail size, Home value, Coordinates — now render through a new compact `_StatCell` widget. `_StatCell` stacks icon+label on one line with the value below, which fits comfortably in a half-width column.
- `_buildPropertyStatGrid(prospect)` takes the non-null stat fields (any subset of the three) and pairs them into rows of two. An odd trailing cell gets a `SizedBox.shrink()` partner so alignment stays stable.
- The grid only emits widgets for fields that are present, so a prospect with no hail/value/coords data shows only the Address.

## Tradeoffs

- **Coordinates precision kept at 5 decimals.** At a typical phone width (360–420 dp) the value fits in a half-column without ellipsis. If very narrow devices start clipping, drop to 4 decimals (still ~11 m accuracy) or switch the cell's text style to `bodySmall`.
- **Why not `GridView`?** A `Row`-of-`Expanded`-cells approach avoids `GridView`'s intrinsic-sizing quirks inside a `Column` and lets each cell's height adapt to its content.

## Related scroll-reduction opportunities

If the overview still doesn't fit on one screen, the next cheap wins (not yet applied):

1. **Record card → 2-column.** `Created` and `Last updated` are both short — the same `_StatCell` + 2-column pattern halves the card's height.
2. **Contact card → inline phone and email.** When both exist, put them side-by-side. Name stays on its own row.
3. **Tighten `_SectionCard` padding.** Currently `fromLTRB(16, 14, 16, 8)` with 12 px gap between cards — reducing to 12/10 shaves ~20 dp per card.
