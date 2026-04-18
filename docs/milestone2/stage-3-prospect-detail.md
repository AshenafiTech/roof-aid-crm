# Stage 3 — Prospect Detail Page

**Goal:** Build the single-prospect view that Telefonistas and Ruferos open hundreds of times a day. 5 tabs, inline edit on overview, status workflow, activity audit log, and notes.

**Outcome:** Clicking a prospect row from Stage 2 opens a complete profile page. All data from the database — no placeholders on tabs that M2 owns.

**Estimated time:** 1.5 days

---

## 1. Scope: which tabs ship in M2

| Tab | M2 Scope | M3 Scope |
|-----|----------|----------|
| Overview | Read + minimal inline edit (name, phone, email, hail_size, home_value) | Full form with geocoding |
| Pipeline | Status change + status history from `activities` | — |
| Assignment | Current assignee + reassign (owner/admin only) | — |
| Activity | Full audit log from `activities` table | — |
| Notes | List + add new note | — |
| Calls / SMS / Email / Docs / Inspection / Map | **NOT IN M2** | M3/M4 |

> Only render the 5 tabs above in the `Tabs` component. Don't build the others yet.

---

## 2. Server component: detail page

**File:** `apps/web/app/(dashboard)/prospects/[id]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProspectTabs } from "./tabs";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: prospect }, { data: activities }, { data: notes }, { data: users }] =
    await Promise.all([
      supabase.from("prospects").select("*, assigned_user:users!assigned_to(*)").eq("id", id).single(),
      supabase.from("activities").select("*, user:users(first_name, last_name)")
        .eq("prospect_id", id).order("created_at", { ascending: false }).limit(100),
      supabase.from("notes").select("*, author:users(first_name, last_name)")
        .eq("prospect_id", id).order("created_at", { ascending: false }),
      supabase.from("users").select("id, first_name, last_name, role")
        .in("role", ["rufero"]),
    ]);

  if (!prospect) notFound();

  // Rufero role check — if assigned_to !== user.id, redirect to /prospects
  if (user.role === "rufero" && prospect.assigned_to !== user.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={prospect.name}
        description={`${prospect.address}, ${prospect.city}, ${prospect.state}`}
        action={<StatusBadge status={prospect.status} />}
      />
      <ProspectTabs
        prospect={prospect}
        activities={activities ?? []}
        notes={notes ?? []}
        ruferos={users ?? []}
        currentUser={user}
      />
    </div>
  );
}
```

> `notFound()` renders the nearest `not-found.tsx`. Create one at `app/(dashboard)/prospects/[id]/not-found.tsx` with a simple "Prospect not found" message + back link.

---

## 3. Tabs component

**File:** `apps/web/app/(dashboard)/prospects/[id]/tabs.tsx`

Client component wrapping shadcn `Tabs`. Receives all data from the server and renders the 5 tab children. Tab state persists via `?tab=` search param so refresh keeps the current tab.

```tsx
"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter, useSearchParams } from "next/navigation";
// ... imports for each tab child

export function ProspectTabs(props: ...) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("tab") ?? "overview";

  function setTab(value: string) {
    const params = new URLSearchParams(sp);
    params.set("tab", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        <TabsTrigger value="assignment">Assignment</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><OverviewTab {...props} /></TabsContent>
      <TabsContent value="pipeline"><PipelineTab {...props} /></TabsContent>
      <TabsContent value="assignment"><AssignmentTab {...props} /></TabsContent>
      <TabsContent value="activity"><ActivityTab {...props} /></TabsContent>
      <TabsContent value="notes"><NotesTab {...props} /></TabsContent>
    </Tabs>
  );
}
```

---

## 4. Tab implementations

### 4.1 Overview tab
Card grid showing all prospect fields. A "Edit" button toggles to an inline form with the 5 M2-allowed fields. Form uses `react-hook-form` + `zod`, calls `updateProspect` server action on submit.

### 4.2 Pipeline tab
Current status + a `Select` to change it. On change, calls `changeStatus` server action. Below the select, render a timeline of past status changes from `activities` where `action = 'status_changed'`.

**Role guards:**
- `rufero`: can only move from `scheduled` → `closed_customer` or `not_viable`
- `telefonista`: can do any transition except `not_viable` → anything
- `admin`/`owner`: any transition

Enforce in the server action. Disable the Select client-side as UX hint but never trust it.

### 4.3 Assignment tab
Shows current assignee. For `owner`/`admin`, a `Select` lists all ruferos. On change → `assignProspect` server action. Logs to activities. Bottom of tab: reassignment history (from activities where `action = 'assigned'`).

For other roles, show assignee read-only.

### 4.4 Activity tab
Full audit log. Table of activities: timestamp, user name, action, changes. Use `DataTable` shared component. No pagination needed for M2 — limit to last 100 in the server component.

### 4.5 Notes tab
- Top: textarea + "Add note" button calling `addNote` action (already built in Stage 2)
- Below: list of notes, newest first. Each note shows author, timestamp, body
- Notes are **not** editable/deletable in M2

---

## 5. Server actions

**File:** `apps/web/app/(dashboard)/prospects/[id]/actions.ts`

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROSPECT_STATUSES } from "@/lib/constants/prospect-status";

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  hail_size: z.number().nullable().optional(),
  home_value: z.number().nullable().optional(),
});

export async function updateProspect(input: unknown) {
  const parsed = updateSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { id, ...patch } = parsed;
  const { error } = await supabase.from("prospects").update(patch).eq("id", id);
  if (error) throw error;

  await supabase.from("activities").insert({
    prospect_id: id,
    user_id: user.id,
    action: "updated",
    changes: patch,
  });

  revalidatePath(`/prospects/${id}`);
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(PROSPECT_STATUSES),
});

export async function changeStatus(input: unknown) {
  const parsed = statusSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch user role from users table
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!profile) throw new Error("User profile not found");

  // Fetch current prospect status to validate transition
  const { data: current } = await supabase.from("prospects").select("status").eq("id", parsed.id).single();
  if (!current) throw new Error("Prospect not found");

  // Role-based transition check (server-side truth)
  if (!canTransition(profile.role, current.status, parsed.status)) {
    throw new Error("You don't have permission to make this status change");
  }

  const { error } = await supabase
    .from("prospects")
    .update({ status: parsed.status })
    .eq("id", parsed.id);
  if (error) throw error;

  await supabase.from("activities").insert({
    prospect_id: parsed.id,
    user_id: user.id,
    action: "status_changed",
    changes: { from: current.status, to: parsed.status },
  });

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath(`/prospects`);
}

export async function assignProspect(input: { id: string; assignedTo: string }) {
  // Similar pattern: role check (owner/admin only), update, log activity, revalidate
}
```

Define `canTransition(role, from, to)` as a small helper in `lib/auth/permissions.ts`.

---

## 6. Loading + error states

- `loading.tsx`: skeleton with header + tab row + card grid
- `not-found.tsx`: "Prospect not found or access denied" + back button
- `error.tsx`: catches render errors in tabs, shows "Something went wrong" + retry

---

## 7. Acceptance criteria

- [ ] Navigating to `/prospects/[id]` loads all 5 tabs
- [ ] Tab state persists in URL (`?tab=activity`)
- [ ] Overview tab shows all prospect fields; edit form saves and revalidates
- [ ] Pipeline tab status change is gated by role; unauthorized transitions throw
- [ ] Pipeline tab shows past status changes
- [ ] Assignment tab allows owner/admin to reassign; others see read-only
- [ ] Activity tab shows audit log with user names
- [ ] Notes tab lists notes and allows adding new ones
- [ ] Every mutation logs to `activities`
- [ ] Rufero accessing an unassigned prospect gets 404
- [ ] Changes visible immediately after save (no stale cache)
- [ ] No TypeScript errors, no `any`

---

## 8. Pitfalls to avoid

- **Don't** validate role only on the client — always re-check in the server action
- **Don't** trust the prospect's current status from the client — fetch it fresh in `changeStatus`
- **Don't** forget `revalidatePath("/prospects")` — otherwise the list page shows stale data after a status change
- **Don't** use `.maybeSingle()` when you want a 404 — use `.single()` and let the null check trigger `notFound()`
