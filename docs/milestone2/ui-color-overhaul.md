# Milestone 2 — UI Color Overhaul

## Purpose
Replace the multi-color "vibecoded" appearance with a single, consistent brand identity using blue as the primary color throughout the CRM.

## What Changed

### Brand Color System (`globals.css`)
- **Primary color**: Changed from near-black (`oklch(0.205 0 0)`) to brand blue (`oklch(0.546 0.245 262.881)` / ~#2563EB)
- **Accent color**: Changed from neutral gray to a light blue tint, so active sidebar items and hover states show brand-consistent blue highlights
- **Focus rings**: Now blue across all inputs and buttons
- **Chart colors**: Replaced grayscale with blue tints/shades
- **Sidebar tokens**: Updated to use brand blue for active/accent states
- **Dark mode**: Uses a lighter blue (`oklch(0.637 0.196 262.881)`) for proper contrast

### Status Colors (`prospect-status.ts`)
Reduced from 6 competing color families to 3:

| Status | Before | After |
|--------|--------|-------|
| New Leads | Blue | Blue (brand) |
| Prospects | Purple | Blue (brand) |
| Contacted | Yellow | Sky (blue sibling) |
| Scheduled | Orange | Sky (blue sibling) |
| Closed Customer | Green | Emerald (success) |
| Not Viable | Gray | Gray (inactive) |

- Removed colored row backgrounds for active statuses (only `not_viable` retains `bg-muted/30`)
- Added `PROSPECT_STATUS_BAR_COLORS` export for pipeline progress bars

### Dashboard (`metrics-cards.tsx`, `pipeline-breakdown.tsx`)
- Metric card icons use `text-primary/20` (faint blue) instead of `text-muted-foreground/40` (gray)
- Pipeline progress bars now use per-status colors matching the restrained palette

## Files Modified
1. `apps/web/app/globals.css`
2. `apps/web/lib/constants/prospect-status.ts`
3. `apps/web/app/(dashboard)/metrics-cards.tsx`
4. `apps/web/app/(dashboard)/pipeline-breakdown.tsx`

## Design Decisions
- **One brand color (blue)** used for all interactive elements: buttons, links, active nav, focus rings, progress bars
- **Status colors** kept for categorization but muted (lighter backgrounds, softer text) and consolidated to 3 hue families
- **No gradients**, no competing accent colors, no dark sidebars with contrasting themes
- All changes flow through CSS custom properties — zero changes needed to shadcn/ui component files
