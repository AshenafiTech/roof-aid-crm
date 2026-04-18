# Stage 2 — Prospects List Page

**Goal:** Ship the primary daily-driver screen for Telefonistas — a filterable, paginated list of prospects with action buttons.

**Outcome:** A Telefonista can filter by city + status, paginate through 60-record pages, click a row to view details, and see role-appropriate data.

**Estimated time:** 1.5 days

---

## 1. Data layer: typed query helpers

**File:** `apps/web/lib/queries/prospects.ts`

Centralize all prospect queries here. Every page calls these — never inline Supabase queries in a page component.

```ts
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ProspectStatus } from "@/lib/constants/prospect-status";

export type Prospect = Database["public"]["Tables"]["prospects"]["Row"];

export type ProspectFilters = {
  city?: string;
  status?: ProspectStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listProspects(filters: ProspectFilters) {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const size = filters.pageSize ?? 60;
  const from = (page - 1) * size;
  const to = from + size - 1;

  let query = supabase
    .from("prospects")
    .select("*, assigned_user:users!assigned_to(id, first_name, last_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.city)   query = query.eq("city", filters.city);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, size };
}

export async function listCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("city")
    .not("city", "is", null);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.city!))).sort();
}
```

> RLS handles the tenant scope. For rufero role, we also add `.eq("assigned_to", userId)` in the page component before calling this (defense in depth).

---

## 2. Filter bar (client component)

**File:** `apps/web/app/(dashboard)/prospects/filters.tsx`

URL-driven filters. On change, uses `router.push` with updated search params. Server component re-renders with new data.

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/lib/constants/prospect-status";
import { useTransition } from "react";

export function Filters({ cities }: { cities: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function update(key: string, value: string | undefined) {
    const params = new URLSearchParams(sp);
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    start(() => router.push(`/prospects?${params.toString()}`));
  }

  // Render city Select, status Select, search Input, and "Query Database" button
  // Button triggers router.refresh() for manual re-query
}
```

---

## 3. Prospects list page (server component)

**File:** `apps/web/app/(dashboard)/prospects/page.tsx`

```tsx
import { PageHeader } from "@/components/shared/page-header";
import { Filters } from "./filters";
import { ProspectTable } from "./prospect-table";
import { listProspects, listCities } from "@/lib/queries/prospects";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RealtimeRefresh } from "./realtime-refresh";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters = {
    city: params.city,
    status: params.status as any,
    search: params.q,
    page: params.page ? Number(params.page) : 1,
    pageSize: 60,
  };

  // Rufero: only assigned
  const [{ rows, total }, cities] = await Promise.all([
    listProspects({
      ...filters,
      // pass assignedTo if user.role === "rufero"
    }),
    listCities(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospects"
        description={`${total} total — page ${filters.page} of ${Math.max(1, Math.ceil(total / 60))}`}
      />
      <Filters cities={cities} />
      <ProspectTable rows={rows} total={total} page={filters.page} />
      <RealtimeRefresh tenantId={user.tenantId} />
    </div>
  );
}
```

> Create `lib/auth/current-user.ts` as a shared helper that returns `AuthUser` or redirects to `/login`. Reuse from dashboard layout.

---

## 4. Prospect table

**File:** `apps/web/app/(dashboard)/prospects/prospect-table.tsx`

Server component. Uses the shared `DataTable` with columns:

| Column | Cell |
|--------|------|
| Name | `row.name` (linked to `/prospects/${row.id}`) |
| Address | `row.address`, `row.city, row.state` |
| Status | `<StatusBadge status={row.status} />` |
| Assigned | `row.assigned_user?.first_name + " " + last_name` or "—" |
| Hail | `row.hail_size ?? "—"` |
| Home Value | formatted currency |
| Actions | `<ProspectRowActions row={row} />` |

Below the table, render the pagination control using `total` and `page`.

---

## 5. Action buttons (client component)

**File:** `apps/web/app/(dashboard)/prospects/prospect-row-actions.tsx`

6 icon buttons per row: Call, SMS, Email, Appt, Go (Navigate), Notes. For M2, only **Notes** is functional — the others show a "Coming in M4/M5" toast via shadcn's `sonner`.

Notes button opens a Dialog with a textarea and a "Save note" action that calls a server action to insert into the `notes` table.

> Keep icons small (`h-4 w-4`). Use `DropdownMenu` on mobile to collapse buttons behind a `...` trigger if they don't fit.

---

## 6. Server actions

**File:** `apps/web/app/(dashboard)/prospects/actions.ts`

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const addNoteSchema = z.object({
  prospectId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

export async function addNote(input: unknown) {
  const parsed = addNoteSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("notes").insert({
    prospect_id: parsed.prospectId,
    body: parsed.body,
    author_id: user.id,
  });
  if (error) throw error;
  revalidatePath(`/prospects/${parsed.prospectId}`);
  revalidatePath(`/prospects`);
}
```

---

## 7. Loading skeleton

**File:** `apps/web/app/(dashboard)/prospects/loading.tsx`

Use shadcn `Skeleton` to render a fake header + filter row + 10 table rows. Matches real layout to avoid layout shift.

---

## 8. Pagination

Simple — no fancy library. Two buttons (Prev / Next) + "Page X of Y" label. Prev disabled when `page === 1`, Next disabled when `page * 60 >= total`. Both update `?page=` in the URL.

---

## 9. RBAC enforcement

In the server page, after `getCurrentUser()`:

```ts
if (user.role === "rufero") {
  filters.assignedTo = user.id; // add this field to ProspectFilters
}
```

And in `listProspects`, conditionally apply `.eq("assigned_to", filters.assignedTo)`.

RLS is the backstop — if someone bypasses the app check, RLS still returns 0 rows from other tenants.

---

## 10. Acceptance criteria

- [ ] `/prospects` loads with 60 rows paginated
- [ ] City filter dropdown lists only distinct cities from the tenant's prospects
- [ ] Status filter dropdown shows all 6 statuses
- [ ] Text search filters by name (case-insensitive)
- [ ] Pagination Prev/Next updates URL and page
- [ ] Click a row → navigates to `/prospects/[id]`
- [ ] 6 action buttons render per row; Notes dialog works; others show toast
- [ ] Rufero user sees only their assigned prospects
- [ ] Loading skeleton shows during navigation
- [ ] Empty state shows when filters return 0 rows
- [ ] No runtime errors in console
- [ ] `RealtimeRefresh` component is a stub for now (wired in Stage 5)

---

## 11. Pitfalls to avoid

- **Don't** fetch cities in the filter component — fetch in the server page and pass down. Keeps the filter dumb.
- **Don't** use `.range(0, 60)` — it's inclusive, so that returns 61 rows. Use `.range(from, from + 59)`.
- **Don't** forget to reset `?page` when a filter changes — otherwise filtering from page 3 shows an empty list.
- **Don't** mutate the URL from an effect — use `router.push` in event handlers only.
