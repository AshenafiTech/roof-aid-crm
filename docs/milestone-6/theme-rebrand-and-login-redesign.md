# Theme rebrand to Roof-Aid blue + login redesign

## Purpose

Make the dashboard's visual theme match the new marketing landing page and
bring the login page up to the same polish level as the signup wizard.

Before this change:
- Dashboard used a violet accent (`oklch(0.60 0.17 285)`) — a leftover from
  an earlier redesign.
- Login was a basic shadcn `Card` on `bg-muted/40` and looked disconnected
  from both the landing and the multi-step signup wizard.

After:
- The whole app uses the landing's `#1058A7`-family blue as its accent.
- Login matches the signup wizard: full-bleed split layout, dark navy
  brand panel on the left, form on the right, DM Sans + Bebas Neue fonts,
  same blue button + radial glows.

## Theme change (`apps/web/app/globals.css`)

Two token blocks changed. Everything that derives from `--accent-color`
(primary buttons, sidebar active state, focus ring, brand mark, avatar
gradient, chart-1) automatically picks up the new colour.

```diff
- /* Accent — violet */
- --accent-h: 285;
- --accent-color: oklch(0.60 0.17 var(--accent-h));
- --accent-soft: oklch(0.60 0.17 var(--accent-h) / 0.18);
- --accent-fg-c: oklch(0.99 0.005 var(--accent-h));
- --accent-ring: oklch(0.60 0.17 var(--accent-h) / 0.40);
+ /* Accent — Roof-Aid blue, matched to the marketing landing. */
+ --accent-h: 250;
+ --accent-color: oklch(0.50 0.16 var(--accent-h));
+ --accent-soft: oklch(0.50 0.16 var(--accent-h) / 0.14);
+ --accent-fg-c: oklch(0.99 0.005 var(--accent-h));
+ --accent-ring: oklch(0.50 0.16 var(--accent-h) / 0.40);
```

```diff
- --chart-1: oklch(0.60 0.17 285);   /* violet (brand) */
+ --chart-1: oklch(0.50 0.16 250);   /* blue (brand) */
```

### Why hue 250 / L=0.50 / C=0.16

The landing page hard-codes `#1058A7`. In oklch that's roughly
`oklch(0.45 0.14 257)`. We picked `oklch(0.50 0.16 250)` instead because:

- Slightly higher lightness (0.50 vs 0.45) keeps hover states from
  bottoming out — `filter: brightness(1.05)` on the existing primary
  button still reads as "lighter," whereas pinning L=0.45 makes the
  hover almost imperceptible.
- Slightly higher chroma (0.16) keeps the colour saturated when applied
  as 14% / 40% alpha (sidebar active background, focus ring) — at lower
  chroma those soft variants wash out to grey.
- The result reads as the same family as the landing's `#1058A7`; the
  two colours are visually adjacent rather than identical, which is fine
  because dashboard buttons sit on a warm off-white background while
  the landing buttons sit on a near-black background — the same hex
  would actually look mismatched.

### What didn't change

- **Font stack.** The dashboard keeps Inter as its body font. DM Sans
  is loaded only by the public landing, the signup wizard, and the
  redesigned login (each scoped under its own wrapper class). Swapping
  the dashboard body font is risky — many tables, badges, and density
  variants are tuned to Inter's metrics, and DM Sans would shift line
  heights everywhere. The brand still feels cohesive because the
  shared colour palette does the heavy lifting.
- **Dark theme bg/fg tokens.** The dark theme keeps its existing cool
  navy backgrounds. Hue 260 is close enough to the new accent hue 250
  that the surfaces still feel intentional next to blue accents.
- **Bebas Neue is not loaded globally.** It's a display font (all-caps,
  geometric) that doesn't belong in dashboard tables. It stays in the
  marketing surfaces only.

## Login redesign

New file map:
```
apps/web/app/(auth)/login/
  page.tsx            # Split layout (brand left, form right)
  login.css           # Login-scoped styles, mirrors signup.css
  login-form.tsx      # Form rewritten to use new CSS classes
  actions.ts          # Unchanged
```

### Layout

```
┌─────────────────────┬──────────────────────┐
│                     │                      │
│  [RA] ROOF-AID      │   Welcome back       │
│                     │   Sign in to         │
│  ● AI Driven        │   Roof-Aid.          │
│                     │                      │
│  First to the       │   [Email]            │
│  Homeowner.         │   [Password 👁]      │
│  Every Time.        │                      │
│                     │   [ Sign in → ]      │
│  500+   60   $4K    │                      │
│                     │   — NEW HERE —       │
│  Questions?         │   [ Create workspace │
│  …@roofaidsales.    │     — Start free →]  │
│                     │                      │
└─────────────────────┴──────────────────────┘
```

- Same colour palette as the signup wizard (`#1058A7` blue, `#0D1922`
  navy, `#22A05B` green, etc.) defined locally on `.ra-login` so
  nothing leaks into the dashboard.
- Same fonts as the wizard (DM Sans body, Bebas Neue display) loaded
  via `<link>` in the page component.
- Same form input style (1.5px border, 8px radius, blue focus ring),
  same primary button (blue shadow, lift-on-hover), same error banner.
- Below 880 px the brand panel collapses to a slim header with just
  the logo, and the form fills the screen.

### Form changes (`login-form.tsx`)

The functional bits are unchanged — same `react-hook-form` + `zod`
validation, same `login` server action call, same redirect target
(`?next=` honoured, default `/dashboard`). What changed:

- Replaced `<Button>` + `<Input>` + `<Label>` + `<Alert>` from shadcn
  with plain elements styled by `login.css`. The shadcn components
  inherit the dashboard's Inter + accent-soft styling, which would
  fight against the wizard-style theme.
- Show/hide-password toggle is now an inline overlay button inside
  the input wrapper (`.pw-wrap`), matching how the rest of the auth
  surfaces handle adornments.
- Added a divider + "Create a workspace" secondary CTA at the bottom
  so visitors who don't have an account have a clear next step
  without leaving the page.

### Removed verbose logging

The previous `login-form.tsx` had heavy `console.log` calls (origin,
result, server-action timings). Those were added during a remote-debug
session; they're not needed for the live product. The server action
in `actions.ts` keeps its `[login]` server-side logs for production
debugging.

## Test plan

1. **Landing → Login.** From `/`, click **Log in**. Confirm split
   layout: dark left panel with brand + headline + numbers, white
   right panel with form.
2. **Resize.** Below ~880 px the left panel's mid-section
   (headline / numbers) hides and the form fills the screen.
3. **Sign in.** Enter valid credentials → redirect to `/dashboard`.
   Enter wrong password → red error banner ("Invalid email or
   password").
4. **Show / hide password.** Click the eye icon → password text
   toggles.
5. **`?next=` is honoured.** Visit `/admin/users` while signed-out →
   redirected to `/login?next=/admin/users`. Sign in → land on
   `/admin/users`.
6. **Dashboard theme.** Sign in. Confirm sidebar active item, primary
   buttons (Import Excel, Prospects), brand mark, avatar chip,
   chart-1 lines are all blue (not violet).
7. **Dark mode.** Toggle to dark theme via existing controls. Accents
   stay blue. Backgrounds stay cool navy.
8. **Focus ring.** Tab into any input on the dashboard. The focus
   ring is the new blue `--accent-ring`.
