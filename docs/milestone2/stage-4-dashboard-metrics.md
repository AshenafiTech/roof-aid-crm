# Stage 4 — Dashboard Home with Real Metrics

**Goal:** Replace the placeholder dashboard cards with real, tenant-scoped metrics driven by Supabase views and an RPC function.

**Outcome:** The dashboard is the first thing every user sees after login. After Stage 4, it shows: prospect counts by status, today's appointments, unread notifications, and recent activity.

**Estimated time:** 0.5–1 day

---

## 1. Database: views + RPC

**File:** `supabase/migrations/0002_dashboard_views.sql`

We create two views and one function. Views are safer than raw joins in client code — RLS still applies because views inherit from the underlying tables.

```sql
-- 1. Prospect counts by status per tenant
create or replace view public.prospect_counts_by_status as
select
  tenant_id,
  status,
  count(*)::int as count
from public.prospects
group by tenant_id, status;

-- 2. Upcoming appointments (next 7 days)
create or replace view public.upcoming_appointments as
select
  a.*,
  p.name as prospect_name,
  p.address as prospect_address,
  p.city as prospect_city
from public.appointments a
join public.prospects p on p.id = a.prospect_id
where a.scheduled_at between now() and now() + interval '7 days'
  and a.status in ('scheduled', 'confirmed');

-- 3. Unread notification count for the current user
create or replace function public.unread_notification_count()
returns int
language sql
security invoker
stable
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

-- RLS: views inherit from tables. Confirm policies exist on prospects, appointments, notifications.
grant select on public.prospect_counts_by_status to authenticated;
grant select on public.upcoming_appointments to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
```

After writing:

```bash
npx supabase db push                           # apply to linked project
npx supabase gen types typescript --linked \
  > apps/web/lib/supabase/database.types.ts   # regenerate types
```

> Every new migration must be followed by a types regeneration. This is a hard rule.

---

## 2. Query helpers

**File:** `apps/web/lib/queries/dashboard.ts`

```ts
import { createClient } from "@/lib/supabase/server";
import type { ProspectStatus } from "@/lib/constants/prospect-status";

export type PipelineCount = { status: ProspectStatus; count: number };

export async function getPipelineCounts(): Promise<PipelineCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_counts_by_status")
    .select("status, count");
  if (error) throw error;
  return (data ?? []) as PipelineCount[];
}

export async function getTodayAppointmentsCount(): Promise<number> {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("scheduled_at", startOfDay.toISOString())
    .lte("scheduled_at", endOfDay.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) throw error;
  return data ?? 0;
}

export async function getRecentActivity(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select("*, user:users(first_name, last_name), prospect:prospects(name, id)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

---

## 3. Metric cards component

**File:** `apps/web/app/(dashboard)/metrics-cards.tsx`

```tsx
import { Card } from "@/components/ui/card";
import { Users, Calendar, Bell, TrendingUp } from "lucide-react";
import type { PipelineCount } from "@/lib/queries/dashboard";

export function MetricsCards({
  pipeline,
  todayAppointments,
  unreadNotifications,
}: {
  pipeline: PipelineCount[];
  todayAppointments: number;
  unreadNotifications: number;
}) {
  const totalProspects = pipeline.reduce((sum, p) => sum + p.count, 0);
  const closed = pipeline.find((p) => p.status === "closed_customer")?.count ?? 0;
  const conversionRate = totalProspects > 0 ? ((closed / totalProspects) * 100).toFixed(1) : "0.0";

  const cards = [
    { label: "Total Prospects", value: totalProspects, icon: Users },
    { label: "Today's Appointments", value: todayAppointments, icon: Calendar },
    { label: "Unread Notifications", value: unreadNotifications, icon: Bell },
    { label: "Conversion Rate", value: `${conversionRate}%`, icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-semibold mt-1">{c.value}</p>
            </div>
            <c.icon className="h-8 w-8 text-muted-foreground/50" />
          </div>
        </Card>
      ))}
    </div>
  );
}
```

---

## 4. Pipeline breakdown component

**File:** `apps/web/app/(dashboard)/pipeline-breakdown.tsx`

Card showing each status and its count as a progress bar. Uses `PROSPECT_STATUSES` to render in a consistent order (not whatever order Postgres returned).

```tsx
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/lib/constants/prospect-status";
import { Card } from "@/components/ui/card";
import type { PipelineCount } from "@/lib/queries/dashboard";

export function PipelineBreakdown({ pipeline }: { pipeline: PipelineCount[] }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  const map = new Map(pipeline.map((p) => [p.status, p.count]));

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Pipeline</h2>
      <div className="space-y-3">
        {PROSPECT_STATUSES.map((status) => {
          const count = map.get(status) ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={status}>
              <div className="flex justify-between text-sm mb-1">
                <span>{PROSPECT_STATUS_LABELS[status]}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

---

## 5. Recent activity component

**File:** `apps/web/app/(dashboard)/recent-activity.tsx`

Simple list of the last 10 activities. Each row: user avatar/name, action, prospect name (linked), timestamp.

---

## 6. Dashboard page

**File:** `apps/web/app/(dashboard)/page.tsx`

```tsx
import { PageHeader } from "@/components/shared/page-header";
import { MetricsCards } from "./metrics-cards";
import { PipelineBreakdown } from "./pipeline-breakdown";
import { RecentActivity } from "./recent-activity";
import {
  getPipelineCounts,
  getTodayAppointmentsCount,
  getUnreadNotificationCount,
  getRecentActivity,
} from "@/lib/queries/dashboard";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [pipeline, todayAppts, unread, activity] = await Promise.all([
    getPipelineCounts(),
    getTodayAppointmentsCount(),
    getUnreadNotificationCount(),
    getRecentActivity(10),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.firstName ?? user.email}`}
        description="Here's what's happening across your pipeline today"
      />
      <MetricsCards
        pipeline={pipeline}
        todayAppointments={todayAppts}
        unreadNotifications={unread}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PipelineBreakdown pipeline={pipeline} />
        <RecentActivity items={activity} />
      </div>
    </div>
  );
}
```

---

## 7. Loading skeleton

**File:** `apps/web/app/(dashboard)/loading.tsx`

Skeleton matching the card grid + two-column bottom layout. Prevents layout shift.

---

## 8. Role-based visibility

All 4 metric cards are visible to everyone in M2. In M7 (analytics), we'll add owner/admin-only cards (MRR, commission revenue). For M2, scope stays simple.

For `rufero` role, filter `getPipelineCounts` and `getRecentActivity` to only their assigned prospects. Can be done with a `.eq('assigned_to', user.id)` override or a separate RPC.

---

## 9. Acceptance criteria

- [ ] Migration `0002_dashboard_views.sql` applied successfully
- [ ] `database.types.ts` regenerated to include the new views/functions
- [ ] Dashboard loads with 4 metric cards showing real numbers
- [ ] Pipeline breakdown shows all 6 statuses in consistent order
- [ ] Recent activity shows last 10 items with clickable prospect links
- [ ] Rufero sees counts scoped to their assigned prospects
- [ ] RLS verified: tenant A user → dashboard shows tenant A numbers only
- [ ] Loading skeleton displays during navigation
- [ ] No runtime errors

---

## 10. Pitfalls to avoid

- **Don't** compute counts in JS — use `{ count: "exact", head: true }` or views
- **Don't** forget to regenerate types after the migration — the new view types won't exist otherwise
- **Don't** use `security definer` on the view — stick with the default (`security invoker`) so RLS applies
- **Don't** hardcode timezone math — use the user's browser TZ for "today's appointments" via `new Date()`
