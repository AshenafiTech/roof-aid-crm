# Redesign Phase 1 — Design system + shell

## Purpose

Apply the visual redesign in `roof aid redesing/` to the live app, starting
with the foundation: the design tokens (colors, spacing, shadows) and the
shared shell (sidebar, topbar, page container) that wrap every authenticated
route. After Phase 1, **every page** in the app is rebranded automatically,
even those whose markup hasn't been touched yet, because shadcn components
read from the same CSS custom properties we redefined.

Default theme is **light** (warm off-white background, white card surfaces,
emerald accent). Dark mode is preserved as an opt-in via the existing
`ThemeToggle`.

## Scope

In Phase 1:

- `apps/web/app/globals.css` — token rebase + redesign component classes
- `apps/web/app/layout.tsx` — flip `defaultTheme` to `light`
- `apps/web/app/(dashboard)/dashboard-shell.tsx` — new `.app / .side / .topbar / .main` structure
- `apps/web/app/(dashboard)/sidebar-nav.tsx` — switch to `.nav / .nav-group-label / .nav-item`

Out of scope (later phases):

- Page-level redesigns (Login, Leads list/map, Lead detail, Notifications,
  Settings, Users, Phone) — Phase 2.
- Pages without designs (Dashboard widgets, Prospects, Contacted, Follow Up,
  Appointments, Closed, Not Viable, Documents, SMS, Email, Analytics,
  Onboarding) — Phase 3.

## Decisions

### One token system, two naming schemes

The existing app uses Tailwind v4 + shadcn, which reads `--background`,
`--primary`, `--muted-foreground`, etc. The redesign prototype uses its own
names (`--bg`, `--accent`, `--fg-3`). Rather than rewriting every shadcn
component, both schemes live in `globals.css` — the redesign tokens are
canonical and the shadcn names alias them.

```css
:root {
  --bg:  oklch(0.985 0.003 80);   /* redesign canonical */
  --fg:  oklch(0.22  0.01  60);

  --background: var(--bg);        /* shadcn bridge */
  --foreground: var(--fg);
}
```

This means:

- Existing pages (`bg-background`, `text-muted-foreground`, `<Card />`,
  `<Button />`) automatically pick up the new palette.
- Redesigned pages can use redesign markup verbatim (`.btn.primary`, `.tag`,
  `.card`) since those classes are shipped in the same stylesheet.

### Dropped the tweaks panel

The prototype's live "Theme / Accent / Density / Sidebar" switcher is a
designer dev tool, not production UI — omitted. Dark/light remains
toggleable via `ThemeToggle` in the sidebar foot.

### `defaultTheme` is now `light`, not `system`

Per stakeholder request: light is the default, regardless of OS preference.
`enableSystem` was removed so a fresh page load always lands on light. Users
who toggle to dark still get persisted preference via `next-themes`.

### Sidebar collapse

The prototype toggled the sidebar with a `data-sidebar="icons"` attribute on
`<html>`. We use the same attribute on the `.app` wrapper (driven by
`useState`), so the CSS selectors (`.app[data-sidebar="icons"] ...`)
match without touching root-level state.

### Mobile

The redesign markup assumes a desktop sidebar. We kept the existing
mobile `<Sheet>` hamburger so the `<768px` viewport experience still works —
the sheet renders the same `<SidebarNav>`, just inside a slide-over.

### `<main>` retains a default padding wrapper

The redesign's `.page` is `padding: 0` and expects each route to provide
its own `.page-inner`. Existing pages haven't been redesigned yet and rely
on the shell's padding, so `<main className="page">` wraps children in a
`<div className="px-4 py-6 sm:px-6">` for now. Phase 2/3 will replace this
with `.page-inner` per route.

## Files changed

| File | Change |
| --- | --- |
| `apps/web/app/globals.css` | Replaced color/shadow tokens with redesign palette (light + dark). Appended redesign component classes (`.app`, `.side`, `.nav`, `.nav-item`, `.topbar`, `.icon-btn`, `.user-chip`, `.btn`, `.field`, `.tag`, `.seg`, `.page`, `.page-inner`, `.page-title`, `.page-sub`). Existing `@layer base` and shadcn polish (`@layer utilities`) preserved. |
| `apps/web/app/layout.tsx` | `defaultTheme="system" enableSystem` → `defaultTheme="light"`. |
| `apps/web/app/(dashboard)/dashboard-shell.tsx` | Replaced flex/Tailwind shell with `.app`/`.side`/`.topbar`/`.main`. New brand mark SVG, status pill, user chip with avatar, sign-out icon button. Mobile sheet retained. |
| `apps/web/app/(dashboard)/sidebar-nav.tsx` | Replaced shadcn-style nav with `.nav` / `.nav-group-label` / `.nav-item`. Active state pill matches redesign. |

## How to verify

1. Hard-refresh the browser (the dev server hot-reloads CSS, but cached
   chunks may persist).
2. Sign in. The shell should render with:
   - White-ish page background, slightly off-white sidebar, emerald
     gradient brand mark, "Roof-Aid CRM" wordmark.
   - Sidebar grouped into **Main / Tools / Admin** with emerald-tinted
     active pill on the current route.
   - Topbar showing the user's role on the left, a "Ready" status pill,
     and on the right: notifications bell, user chip with initials,
     sign-out icon button.
3. Toggle the sidebar collapse (chevron in the sidebar header) — the
   sidebar should narrow to 56px and only show icons.
4. Click the theme toggle in the sidebar foot — colors should flip to the
   warm-slate dark palette.
5. Existing pages (Dashboard, All Leads, Notifications, Admin/Users) all
   render and have their colors rebased to the emerald palette automatically.

## Known limitations after Phase 1

- Existing pages still use shadcn `<Card>`, `<Table>`, `<Button>` markup —
  they look "rebranded" but not yet "redesigned." Phase 2 swaps the
  high-traffic pages (Leads, Lead detail, Notifications, Settings, Users,
  Phone, Login) to the redesign's markup.
- Sidebar nav badges (e.g., "302" on All Leads, "60" on New Leads) are not
  populated yet — the redesign's `nav-items` schema has a `badge` field;
  we haven't wired live counts into `nav-items.ts`. Will land alongside
  the leads redesign in Phase 2.
- Status pill in the topbar shows a static "Ready". The full version
  surfaces the active outbound caller-ID number — that comes with the
  Phone page redesign in Phase 2.
