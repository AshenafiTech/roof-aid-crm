# Font Family

## Purpose

Replace Geist with Inter as the app-wide sans font and JetBrains Mono for monospace. Also fix a wiring bug in `globals.css` that caused `--font-sans` to self-reference and silently fall back to the browser default.

## Changes

### `apps/web/app/layout.tsx`

- Swapped `Geist` + `Geist_Mono` for `Inter` + `JetBrains_Mono` from `next/font/google`.
- Kept distinct CSS variable names (`--font-inter`, `--font-jetbrains-mono`) so they don't collide with Tailwind v4's theme tokens (`--font-sans`, `--font-mono`).
- Added `display: "swap"` to both to avoid FOIT on slow connections.

### `apps/web/app/globals.css`

`@theme inline` block previously had:

```css
--font-sans: var(--font-sans);        /* self-reference — resolved to system default */
--font-mono: var(--font-geist-mono);
--font-heading: var(--font-sans);
```

Replaced with concrete chains that reference the Next font variables and include fallbacks:

```css
--font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
--font-heading: var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

## Decisions & notes

- **Inter** is the de-facto standard for SaaS dashboards — neutral, highly legible at small sizes, wide weight range. Safe pick given the request didn't specify a target font.
- The previous `--font-sans: var(--font-sans)` was a latent bug: Next's font loader did set `--font-geist-sans` on `<html>`, but the theme token looked up `--font-sans`, which was never defined — so the whole app rendered in the OS default sans. The fix makes the loaded font actually apply.
- No component code required changes; all `font-sans` / `font-mono` / `font-heading` utilities now resolve correctly through the updated theme tokens.
