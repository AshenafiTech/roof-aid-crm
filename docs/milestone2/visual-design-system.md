# Visual Design System — Modern SaaS + Dark

## Purpose

Redesign the CRM's **visual style only** — colors, radius, shadows, typography, spacing rhythm, and component polish. No layout, no structural, and no component API changes. All updates flow through CSS design tokens in `apps/web/app/globals.css` so every shadcn primitive adopts the new look automatically.

Two cohesive directions shipped together: **Modern SaaS** (light) and **Elegant Minimal** (dark). Both share the same radius, shadow, and typography scale — only the color palette differs.

---

## 1. Color palette

All tokens live in `oklch()` for perceptually uniform interpolation; hex values below are sRGB approximations.

### Light — Modern SaaS

| Role | Token | Approx hex | Notes |
| --- | --- | --- | --- |
| Background | `--background` | `#FAFAFB` | Soft off-white, never pure #FFF |
| Card / popover | `--card` | `#FFFFFF` | Pure white for elevation pop |
| Sidebar | `--sidebar` | `#F5F6F8` | Slightly darker than background |
| Foreground | `--foreground` | `#17181C` | High contrast, not pure black |
| Muted text | `--muted-foreground` | `#6B7280` | Captions, helper text |
| Primary | `--primary` | `#4F46E5` | Muted indigo — not saturated |
| Accent surface | `--accent` | `#EEF0FB` | Soft indigo pill (sidebar active) |
| Accent text | `--accent-foreground` | `#4338CA` | Readable on accent surface |
| Border | `--border` | `#E5E7EB` | Very subtle, 1px, low contrast |
| Input fill | `--input` | `#EFF1F4` | Soft fill in place of hard borders |
| Ring (focus) | `--ring` | `#4F46E5` | Used for focus glow |
| Destructive | `--destructive` | `#DC2626` | |

Chart accents: indigo → teal → cyan → violet → soft indigo, for dense KPI dashboards.

### Dark — Elegant Minimal

| Role | Token | Approx hex | Notes |
| --- | --- | --- | --- |
| Background | `--background` | `#0F1115` | Deep gray, NOT pure black |
| Card / popover | `--card` | `#161A20` | One step lighter — depth via layering |
| Sidebar | `--sidebar` | `#12161C` | Subtly distinct from bg |
| Foreground | `--foreground` | `#E6EAF0` | Soft white, no glare |
| Muted text | `--muted-foreground` | `#9AA4B2` | |
| Primary | `--primary` | `#818CF8` | Desaturated violet — readable on dark |
| Accent surface | `--accent` | `#262B3A` | Cool indigo-tinted surface |
| Border | `--border` | `rgba(255,255,255,0.07)` | Nearly invisible |
| Input fill | `--input` | `#1F242C` | Soft fill |

**Design intent**: avoid high-contrast glare; rely on surface-layer separation (bg → sidebar → card → popover) rather than hard borders.

---

## 2. Border radius system

10px base, proportional scale. Fits buttons/inputs at 8px and cards at 14px per spec.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 6px (0.6 × base) | Badges, chips, checkboxes |
| `--radius-md` | 8px (0.8 × base) | **Buttons, inputs, selects** |
| `--radius-lg` | 10px (1.0 × base) | Dropdowns, popovers |
| `--radius-xl` | 14px (1.4 × base) | **Cards, dialogs, sheets** |
| `--radius-2xl` | 18px | Marketing surfaces |

Base: `--radius: 0.625rem;`

---

## 3. Shadow system

Soft, layered elevation — no single "harsh drop". Light uses cool-tinted `rgb(16 24 40 / α)`; dark uses pure black at higher α so elevation reads without glow.

```css
--shadow-xs:    0 1px 2px 0 rgb(16 24 40 / 0.04);
--shadow-sm:    0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06);
--shadow-md:    0 2px 4px -2px rgb(16 24 40 / 0.05), 0 4px 10px -2px rgb(16 24 40 / 0.08);
--shadow-lg:    0 6px 14px -4px rgb(16 24 40 / 0.08), 0 12px 28px -8px rgb(16 24 40 / 0.10);
--shadow-xl:    0 12px 24px -8px rgb(16 24 40 / 0.10), 0 24px 48px -12px rgb(16 24 40 / 0.14);
--shadow-focus: 0 0 0 4px rgb(79 70 229 / 0.18);
```

Dark mode substitutes `rgb(0 0 0 / 0.35–0.65)` and `rgb(129 140 248 / 0.22)` for the focus ring.

### Applied where

- **xs** — resting state on primary buttons
- **sm** — cards at rest, button hover
- **md** — tooltips
- **lg** — dropdowns, popovers, select content
- **xl** — dialogs, sheets
- **focus** — all interactive focus-visible states

---

## 4. Typography scale

Font: **Inter** (variable, `cv11 ss01 ss03` stylistic sets for a cleaner `a`/`g`/`l`). Mono: **JetBrains Mono**. Rendering: antialiased, `optimizeLegibility`, body letter-spacing `-0.005em`, headings `-0.018em` (tighter display tracking).

| Role | Tailwind | Size | Weight | Line-height |
| --- | --- | --- | --- | --- |
| Display / h1 | `text-3xl` | 30px | 600 | 1.2 |
| h2 | `text-2xl` | 24px | 600 | 1.25 |
| h3 | `text-xl` | 20px | 600 | 1.3 |
| h4 | `text-lg` | 18px | 600 | 1.35 |
| Body | `text-base` | 16px | 400 | 1.5 |
| Body small | `text-sm` | 14px | 400 | 1.5 |
| Caption | `text-xs` | 12px | 500 | 1.4 |
| Uppercase label | `text-xs uppercase tracking-wider` | 12px | 500 | — |

**Numeric data** (tables, metric cards) uses `font-variant-numeric: tabular-nums` so columns align vertically without jitter.

---

## 5. Spacing rhythm

4/8px base grid (Tailwind default), with density deliberately loosened for a premium feel:

- **Table row padding**: `py-3` (was cramped `py-2`) — handled via shadcn defaults
- **Card padding**: `p-6` on body, `p-4` on compact cards
- **Filter bar gap**: `gap-3` between control groups
- **Sidebar nav item**: `px-3 py-2` with `gap-3` icon→label

No structural change was made to existing components — spacing comes from the defaults the components already ship with.

---

## 6. Component styling guidelines

All polish is applied via `@layer components` in `globals.css` using `[data-slot="..."]` selectors (shadcn already emits these). No component file was edited.

### Buttons (`[data-slot="button"]`)
- Smooth 160ms transitions on color, background, border, shadow
- Primary: `--shadow-xs` at rest → `--shadow-sm` on hover
- Focus-visible: `--shadow-focus` ring
- Ghost/secondary: subtle bg fade on hover

### Inputs / Textarea / Select trigger
- **Soft fill** (`--input`) replaces hard 1px border at rest
- Hover: fill darkens subtly (mixes 4% foreground)
- Focus: background switches to `--card`, border becomes 50% ring, shadow adds `--shadow-focus`

### Cards (`[data-slot="card"]`)
- `--radius-xl` (14px)
- `--shadow-sm` at rest, border at 70% opacity of `--border`
- Elevation > borders for hierarchy

### Tables
- **Grid lines removed** — only bottom border per row, at 60% opacity of `--border`
- Headers: `font-weight: 500`, muted color, `tracking-wide`, no all-caps transform
- Row hover: `color-mix(muted, transparent, 55/45)` — subtle wash, not harsh
- Selected row: 8% primary tint
- `tabular-nums` for all numeric cells

### Dropdowns / Popovers / Selects
- `--radius-lg` + `--shadow-lg`
- Border at 80% `--border` opacity

### Dialog / Sheet
- `--radius-xl` + `--shadow-xl` — significant layered depth

### Sidebar nav (`<SidebarNav>`)
- Active item: soft indigo pill via `--accent` / `--accent-foreground` (no harsh blue block)
- Hover: `bg-accent/60` wash
- Sidebar surface is `--sidebar`, intentionally 1 shade off from background

### Scrollbars
- Slim 10px, thumb tinted from foreground at 12% (22% on hover), rounded, track transparent — WebKit only

### Selection
- `::selection` uses 22% primary tint, foreground text color

---

## 7. BEFORE → AFTER summary

| Area | Before | After |
| --- | --- | --- |
| **Background** | Pure white (`oklch(1 0 0)`) | Soft off-white `#FAFAFB`; dark uses layered `#0F1115`/`#161A20`/`#12161C` |
| **Primary** | Vivid indigo (chroma `0.245`) — slightly gaudy | Muted indigo (chroma `0.165`) — Linear/Stripe feel |
| **Borders** | Mid-gray `oklch(0.922)` everywhere | Softer `#E5E7EB`, additionally reduced to 60–80% opacity on tables, cards, menus |
| **Shadows** | None defined; components relied on default shadcn classes | 6-step layered system (`xs/sm/md/lg/xl/focus`) tuned for both themes |
| **Radius** | 10px base, but no component-level polish | Same base, applied deliberately per surface (badge 6 / btn 8 / popover 10 / card 14) |
| **Font pipeline** | `--font-sans: var(--font-sans)` self-referenced → system default | Inter properly wired via `--font-inter`, with stylistic sets + tabular nums for dashboards |
| **Headings** | No custom tracking or feature-settings | `-0.018em` tracking + Inter `cv11 ss01` for a tighter display feel |
| **Tables** | Default borders all sides, compact | Only bottom border per row at reduced opacity, row hover wash, tabular numbers |
| **Inputs** | Hard 1px border at rest | Soft `--input` fill at rest, ring + shadow on focus |
| **Sidebar active** | Saturated accent block | Soft indigo pill — subtle and premium |
| **Focus states** | Default browser outline | Unified `--shadow-focus` — 4px ring, 18% primary alpha |
| **Scrollbars** | OS default | Slim 10px, tinted from foreground, matches both themes |
| **Dark mode** | Generic neutral grays | Cool blue-tinted grays (`260` hue), depth via surface layering, desaturated violet primary |

---

## 8. Implementation — CSS variables (summary)

Token surface (excerpt; full source at `apps/web/app/globals.css`):

```css
:root {
  --background: oklch(0.992 0.002 247);
  --foreground: oklch(0.205 0.015 260);
  --card: oklch(1 0 0);
  --primary: oklch(0.545 0.165 265);
  --muted-foreground: oklch(0.555 0.015 260);
  --border: oklch(0.925 0.004 260);
  --input: oklch(0.955 0.004 260);
  --ring: oklch(0.545 0.165 265);
  --sidebar: oklch(0.975 0.004 260);
  --sidebar-accent: oklch(0.955 0.020 265);
  --sidebar-accent-foreground: oklch(0.475 0.175 265);
  --radius: 0.625rem;
  --shadow-sm: 0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06);
  --shadow-md: 0 2px 4px -2px rgb(16 24 40 / 0.05), 0 4px 10px -2px rgb(16 24 40 / 0.08);
  --shadow-focus: 0 0 0 4px rgb(79 70 229 / 0.18);
}
.dark {
  --background: oklch(0.178 0.010 260);
  --card: oklch(0.215 0.010 260);
  --primary: oklch(0.700 0.125 270);
  --border: oklch(1 0 0 / 7%);
  --input: oklch(0.265 0.010 260);
  /* …and the dark-tuned shadow set */
}
```

All shadcn `[data-slot]` overrides (buttons, inputs, cards, tables, dropdowns, dialogs, badges) live in a single `@layer components` block at the bottom of `globals.css` — easy to audit and revert.

---

## 9. Constraints honored

- **No layout changes** — no component moved or resized.
- **No API changes** — no component prop altered; no file outside `globals.css` touched for visuals.
- **Token-driven** — every surface, radius, shadow, and focus ring is a variable → theme swap requires only `.dark` override.
- **Reversible** — remove the `@layer components` block and revert the `:root` / `.dark` blocks to restore the previous system.
