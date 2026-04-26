# Router Cache Stale Times

## Purpose

Returning to the prospects list after viewing a detail (browser back or the
new "Back" button) was triggering a full server re-render every time, which
felt sluggish even when nothing had changed.

In Next.js 15+ the App Router's client-side router cache defaults to a
`dynamic` stale time of **0 seconds**. Any visit to a dynamic segment after
navigating away re-fetches it from the server, no matter how briefly the
user was away.

## Fix

Set `experimental.staleTimes` in `apps/web/next.config.ts`:

```ts
experimental: {
  staleTimes: {
    dynamic: 30,   // seconds — reuse cached page on back-nav
    static: 180,
  },
}
```

- `dynamic: 30` — when a user goes back to `/prospects` (with their filters
  in the URL) within 30 seconds, the cached render is reused. The page
  pops up instantly with their place restored.
- `static: 180` — kept above the documented 30s minimum.

## Why This Is Safe Here

All server actions on the detail page (`app/(dashboard)/prospects/[id]/actions.ts`)
already call `revalidatePath("/prospects")` after mutations. That call
invalidates the cached entry, so when the user goes back after taking an
action, they see fresh data. The 30s stale window only kicks in when no
mutation occurred — exactly the case where re-fetching had no value.

The prospects list also subscribes to realtime updates via
`<RealtimeRefresh />`, so any cross-user drift triggers `router.refresh()`
automatically.

## Tradeoffs

- A user who navigates away from `/prospects`, mutates state through some
  *other* path that does not call `revalidatePath('/prospects')`, then
  comes back within 30s, would see slightly stale data. The realtime
  channel covers this in practice.
- Per-route opt-out is possible if a future page needs always-fresh
  semantics — call `revalidatePath` explicitly or shorten the window.
