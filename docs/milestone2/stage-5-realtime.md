# Stage 5 — Real-time Updates

**Goal:** Wire Supabase Realtime to the prospects list, dashboard, and notifications so users see changes without refreshing.

**Outcome:** When someone updates a prospect's status in one tab, every other open tab showing that prospect updates within 1–2 seconds. Same for new prospects, new notifications.

**Estimated time:** 0.5 day

---

## 1. Enable Realtime on the relevant tables

In Supabase Studio → Database → Replication → toggle on for:

- `prospects`
- `notifications`
- `activities` (optional — enables live activity feed)

Or via SQL in a new migration `supabase/migrations/0003_enable_realtime.sql`:

```sql
alter publication supabase_realtime add table public.prospects;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.activities;
```

RLS still applies to Realtime events — users only receive events for rows they can read.

---

## 2. Strategy: server-rendered + client-refreshed

We do **not** duplicate data in client state. The Server Component is always the source of truth.

Pattern:
1. Server Component renders the initial list
2. A small client component subscribes to `postgres_changes` on the relevant table
3. When an event arrives, the client calls `router.refresh()`
4. Next.js re-runs the Server Component and streams the updated HTML
5. React reconciles — no manual state merging

This is simpler than optimistic updates, and for a low-traffic CRM dashboard, `router.refresh()` is fast enough.

---

## 3. Reusable Realtime hook

**File:** `apps/web/lib/hooks/use-realtime-refresh.ts`

```ts
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesFilter } from "@supabase/supabase-js";

type Options = {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

export function useRealtimeRefresh({ table, filter, event = "*" }: Options) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}:${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, filter } as RealtimePostgresChangesFilter<"*">,
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, router]);
}
```

> The cleanup is critical. Forgetting `removeChannel` causes memory leaks and duplicate events after every navigation.

---

## 4. Mount points

### 4.1 Prospects list

**File:** `apps/web/app/(dashboard)/prospects/realtime-refresh.tsx`

```tsx
"use client";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function RealtimeRefresh({ tenantId }: { tenantId: string }) {
  useRealtimeRefresh({
    table: "prospects",
    filter: `tenant_id=eq.${tenantId}`,
  });
  return null;
}
```

Already referenced in Stage 2's server page. Now it does real work.

### 4.2 Prospect detail

**File:** `apps/web/app/(dashboard)/prospects/[id]/realtime-refresh.tsx`

```tsx
"use client";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function RealtimeRefresh({ prospectId }: { prospectId: string }) {
  useRealtimeRefresh({
    table: "prospects",
    filter: `id=eq.${prospectId}`,
  });
  useRealtimeRefresh({
    table: "activities",
    filter: `prospect_id=eq.${prospectId}`,
  });
  useRealtimeRefresh({
    table: "notes",
    filter: `prospect_id=eq.${prospectId}`,
  });
  return null;
}
```

Mount in the detail page so status/notes/activity updates stream live.

### 4.3 Dashboard

**File:** `apps/web/app/(dashboard)/realtime-refresh.tsx`

```tsx
"use client";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function DashboardRealtime({ tenantId, userId }: { tenantId: string; userId: string }) {
  useRealtimeRefresh({ table: "prospects", filter: `tenant_id=eq.${tenantId}` });
  useRealtimeRefresh({ table: "notifications", filter: `user_id=eq.${userId}` });
  return null;
}
```

Mount in `app/(dashboard)/page.tsx`.

---

## 5. Notification bell (basic)

**File:** `apps/web/app/(dashboard)/notification-bell.tsx`

A client component in the top bar that:
1. Receives initial unread count as a prop from the dashboard layout
2. Subscribes to `notifications` where `user_id=eq.{userId}`
3. On `INSERT`, increments the badge and optionally shows a toast
4. On `UPDATE` (marked as read), re-fetches the count

For M2, we use the simple pattern: on every event, call `router.refresh()` — the server component in the layout refetches the count. Optimize only if it feels slow.

Full notification dropdown (list + mark read + navigation) is in **M4**. M2 only ships the badge.

---

## 6. Testing

Manual test with two browser tabs:

1. Open `/prospects` in tab A as owner
2. Open `/prospects/[some-id]` in tab B as same user
3. In tab B, change the status → tab A list row updates within 2 seconds
4. In Supabase Studio, insert a new prospect → tab A shows it
5. Delete a prospect in Studio → tab A removes it
6. Open two users in different tabs (Tenant A, Tenant B) → changes in one never leak to the other (RLS verification)

Automate this later with Playwright — out of scope for M2.

---

## 7. Acceptance criteria

- [ ] Realtime enabled on `prospects`, `notifications`, `activities`
- [ ] `useRealtimeRefresh` hook unsubscribes on unmount (test by navigating away and back)
- [ ] Prospects list updates live on INSERT/UPDATE/DELETE
- [ ] Prospect detail page updates when status/notes change
- [ ] Dashboard updates when prospects change
- [ ] Notification badge increments on new notification INSERT
- [ ] RLS holds: tenant A tab never sees tenant B events
- [ ] No duplicate subscriptions after multiple navigations (check Supabase dashboard → Realtime inspector)
- [ ] No memory leaks in DevTools performance tab after 10 minutes

---

## 8. Pitfalls to avoid

- **Don't** subscribe in a Server Component — Realtime requires client lifecycle
- **Don't** forget `removeChannel` in the cleanup — one of the most common bugs in Supabase apps
- **Don't** create one subscription per row in a list — one channel per table is enough
- **Don't** use `router.refresh()` inside the event handler without debouncing if you expect high volume — but for M2's scale this is fine
- **Don't** put the subscription in a parent that re-renders frequently — it'll create/destroy the channel in a loop
