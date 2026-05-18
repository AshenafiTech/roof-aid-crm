# Theme retune — violet accent + cool navy dark mode

## Purpose
Adopt the color combination from the reference screenshot:
- Vibrant violet/purple as the brand accent (was emerald).
- Cool dark-navy neutrals in dark mode (were warm slate).
- Coral red for danger (already close — left unchanged).
- Light mode neutrals untouched (only the accent shifts).

No layout, markup, or icon changes — purely token retuning.

## Files changed
- `apps/web/app/globals.css`

## Token changes

### Accent (shared by light + dark)
| Token | Before | After |
| --- | --- | --- |
| `--accent-h` | `152` (emerald) | `285` (violet) |
| `--accent-color` | `oklch(0.72 0.14 ...)` | `oklch(0.62 0.22 ...)` |
| `--accent-soft` | `oklch(0.72 0.14 ... / 0.14)` | `oklch(0.62 0.22 ... / 0.18)` |
| `--accent-fg-c` | `oklch(0.18 0.02 ...)` (near-black) | `oklch(0.99 0.005 ...)` (near-white) |
| `--accent-ring` | `... / 0.35` | `... / 0.40` |

`--accent-fg-c` flipped from near-black to near-white because the new accent is dark enough that white text reads better on filled buttons (Map, Call, etc.).

### Dark-mode neutrals (hue 60 warm → hue 260 cool blue)
All `--bg`, `--bg-2`, `--bg-3`, `--surface`, `--surface-2`, `--line`, `--line-soft`, `--fg`, `--fg-2`, `--fg-3`, `--fg-4` shifted to chroma ~0.020 at hue 260. `--bg` also deepened slightly (`0.165` → `0.155`) to match the screenshot's darker navy.

### Charts
- `--chart-1` is now violet (matches brand).
- Old emerald demoted to `--chart-5` so the palette still has variety.

## Things deliberately left alone
- **Light-mode neutrals** — the screenshot is dark mode only; the warm cream light theme remains.
- **Semantic emerald usages** in TSX (`text-emerald-*`, `bg-emerald-*` on call-connected, completed appointments, "Ready" status, `closed_customer`, sales positives, softphone). These convey success/connected states, not branding — recoloring them to violet would reduce semantic clarity.
- **Danger red** — current `oklch(0.66 0.18 25)` already matches the coral red in the screenshot.

## How to verify
Open any dark-mode page (e.g. `/prospects` map view). The Map button, Call button, "Prospects" tags, active sidebar item, and selected-row highlight should all be violet on a dark navy backdrop.
