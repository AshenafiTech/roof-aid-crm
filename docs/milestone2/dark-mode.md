# Dark Mode — Telegram-Inspired

## Purpose

Add a user-toggleable dark mode whose palette mimics Telegram's dark theme — soft blue-gray surfaces (not pitch black), calm blue active accents, and our existing vibrant violet brand kept intact for `--primary` so the brand reads consistently across themes.

## What changed

### 1. Palette — `apps/web/app/globals.css` `.dark` block

Surfaces tuned to Telegram's reference palette:

| Token | Light | Dark (Telegram-style) | Notes |
| --- | --- | --- | --- |
| `--background` | `#F3F4FA` | `#1D252D` | Soft blue-gray, not black |
| `--card` | `#FFFFFF` | `#28313B` | Lifted surface |
| `--popover` | `#FFFFFF` | `#2C3641` | Slightly lifted further |
| `--sidebar` | `#FFFFFF` | `#1D252D` | Same as bg, separated by border (Telegram convention) |
| `--accent` (active pill) | `#E2E6FF` | `#255481` | Calm Telegram blue |
| `--accent-foreground` | `#5C42D8` | light blue text | |
| `--primary` | `#5B61FF` | `#A78BFA` | Brand violet — unchanged in spirit, lighter on dark for legibility |
| `--muted-foreground` | `#7A7E8C` | `#8A99AC` | |
| `--border` | `#DDE1E7` | `rgba(255,255,255,0.08)` | Almost invisible — depth via layering |
| `--ring` | violet | Telegram blue `#5288C1` | Focus ring switches to blue on dark |

Shadows use pure black at 0.30–0.65 α — soft, not harsh.

### 2. Theme provider — `apps/web/app/layout.tsx`

Wrapped the app in `ThemeProvider` (next-themes) with:
- `attribute="class"` — adds `class="dark"` to `<html>`
- `defaultTheme="system"` — respects OS preference until user picks
- `enableSystem` — listens to `prefers-color-scheme`
- `disableTransitionOnChange` — prevents the all-pages flash when toggling
- `<html suppressHydrationWarning>` was already in place

### 3. Toggle component — `apps/web/components/theme-toggle.tsx`

`ThemeToggle` is a single button rendered with two variants:
- **Expanded** (sidebar open) — full-width ghost button with `Moon`/`Sun` icon + label
- **Collapsed** (sidebar collapsed) — icon-only square button

Renders nothing themed until `mounted === true` to avoid SSR/hydration mismatch (the icon is hidden until then; label falls back to "Theme").

### 4. Mount points — `apps/web/app/(dashboard)/dashboard-shell.tsx`

- **Desktop sidebar**: bottom of the sidebar, separated by `border-t`. Adapts to collapsed state.
- **Mobile sheet**: bottom of the sheet content, also separated by `border-t`. Sheet body uses `flex flex-col` with `overflow-y-auto` on the nav region so the toggle stays pinned.

## Files touched

- Edited: `apps/web/app/globals.css` (`.dark` block fully retuned)
- Edited: `apps/web/app/layout.tsx` (provider wrap)
- Edited: `apps/web/app/(dashboard)/dashboard-shell.tsx` (toggle in desktop sidebar + mobile sheet)
- Added: `apps/web/components/theme-provider.tsx`
- Added: `apps/web/components/theme-toggle.tsx`

## Decisions & notes

- **Brand stays violet across themes.** Telegram dark uses a blue accent throughout, but the project's brand identity is violet. We compromise: surfaces are Telegram-blue-gray, but `--primary` stays violet (`#A78BFA` on dark for legibility). The active sidebar pill uses Telegram's blue (`#255481`) — that's the most "Telegram-like" surface a user interacts with.
- **`defaultTheme="system"`** chosen over `"light"` so users on dark-mode OSes get dark on first visit; the toggle still overrides.
- **`disableTransitionOnChange`** prevents a 200-300ms flash where every transition runs simultaneously across the page on toggle.
- **No CSS-in-JS.** All theming flows through the existing token system — components didn't need to change.
- **Mobile parity.** Toggle ships in both sidebars so phone users aren't stuck on whatever the OS picked.
