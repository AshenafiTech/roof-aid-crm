# Stage 1 — Shared UI Foundation + Sidebar Navigation

**Goal:** Install the shadcn/ui components M2 needs, build the 4 shared components used everywhere, and ship a production-quality role-aware sidebar + dashboard shell.

**Outcome:** When Stage 1 is done, the dashboard is ready to host any feature page. No more ad-hoc layout work for Stages 2–5.

**Estimated time:** 1 day

---

## 1. Install shadcn/ui components

Run from `apps/web`:

```bash
pnpm dlx shadcn@latest add table dialog select tabs badge dropdown-menu sheet avatar separator skeleton sonner
```

Verify files land in `apps/web/components/ui/`. Commit immediately.

---

## 2. Create constants for prospect status

**File:** `apps/web/lib/constants/prospect-status.ts`

Defines the 6 statuses, their labels, colors, and display order. Every page in M2 pulls from here — no duplicated color/label strings.

```ts
export const PROSPECT_STATUSES = [
  "new_leads",
  "prospects",
  "contacted",
  "scheduled",
  "closed_customer",
  "not_viable",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new_leads: "New Leads",
  prospects: "Prospects",
  contacted: "Contacted",
  scheduled: "Scheduled",
  closed_customer: "Closed Customer",
  not_viable: "Not Viable",
};

export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  new_leads: "bg-blue-100 text-blue-800 border-blue-200",
  prospects: "bg-purple-100 text-purple-800 border-purple-200",
  contacted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  scheduled: "bg-orange-100 text-orange-800 border-orange-200",
  closed_customer: "bg-green-100 text-green-800 border-green-200",
  not_viable: "bg-gray-100 text-gray-800 border-gray-200",
};
```

> Verify the exact status enum values against `supabase/migrations/*.sql` — if the schema uses different names, match the database, not this doc.

---

## 3. Build shared components

### 3.1 `PageHeader`

**File:** `apps/web/components/shared/page-header.tsx`

Standard page header: title, optional description, optional right-side action slot.

```tsx
type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, action }: Props) {
  return (
    <div className="flex items-start justify-between pb-6 border-b">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

### 3.2 `StatusBadge`

**File:** `apps/web/components/shared/status-badge.tsx`

Takes a `ProspectStatus` and renders a pill using the color map.

```tsx
import { cn } from "@/lib/utils";
import {
  type ProspectStatus,
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
} from "@/lib/constants/prospect-status";

export function StatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        PROSPECT_STATUS_COLORS[status],
      )}
    >
      {PROSPECT_STATUS_LABELS[status]}
    </span>
  );
}
```

### 3.3 `DataTable`

**File:** `apps/web/components/shared/data-table.tsx`

Thin wrapper around shadcn's `Table` that accepts columns + rows + an optional empty state and pagination slot. Keep it dumb — no TanStack Table yet. We can upgrade in M3 if sorting/column management needs grow.

```tsx
type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({ columns, rows, empty, footer, onRowClick }: Props<T>) {
  // Render shadcn Table with header + body + empty state + footer slot
}
```

### 3.4 `ProspectCard`

**File:** `apps/web/components/shared/prospect-card.tsx`

Used in the list view (Stage 2). Takes a `Prospect` row and renders: name, address/city, StatusBadge, assigned rufero, hail size, and a slot for the 6 action buttons.

Build the skeleton in Stage 1; wire up action buttons in Stage 2.

---

## 4. Sidebar navigation

### 4.1 Nav config

**File:** `apps/web/app/(dashboard)/nav-items.ts`

A typed array of nav items — each with label, href, icon, and an allowed roles list. The sidebar maps over this to decide what to render.

```ts
import type { UserRole } from "@/lib/types/auth";
import {
  LayoutDashboard, Users, Calendar, FileText,
  MessageSquare, UserCog, BarChart3, Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  section: "main" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard,
    roles: ["owner", "admin", "telefonista", "rufero"], section: "main" },
  { label: "Prospects", href: "/prospects", icon: Users,
    roles: ["owner", "admin", "telefonista", "rufero"], section: "main" },
  { label: "Appointments", href: "/appointments", icon: Calendar,
    roles: ["owner", "admin", "telefonista", "rufero"], section: "main" },
  { label: "Documents", href: "/documents", icon: FileText,
    roles: ["owner", "admin", "telefonista", "rufero"], section: "main" },
  { label: "Communications", href: "/communications", icon: MessageSquare,
    roles: ["owner", "admin", "telefonista"], section: "main" },

  { label: "Users", href: "/admin/users", icon: UserCog,
    roles: ["owner", "admin"], section: "admin" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3,
    roles: ["owner", "admin"], section: "admin" },
  { label: "Settings", href: "/admin/settings", icon: Settings,
    roles: ["owner"], section: "admin" },
];
```

### 4.2 Sidebar component

**File:** `apps/web/app/(dashboard)/sidebar.tsx`

- Client component (needs `usePathname` + collapse state)
- Desktop: persistent sidebar, collapsible (icon-only ↔ full)
- Mobile: `Sheet` from shadcn triggered by a hamburger in the top bar
- Active route: highlight by comparing `pathname.startsWith(item.href)`
- Filter nav items by `user.role`
- Group by `section` — render "Admin" header above admin section

### 4.3 Hook up the shell

Update `apps/web/app/(dashboard)/dashboard-shell.tsx`:

```
<div className="flex h-screen">
  <Sidebar user={user} />
  <div className="flex-1 flex flex-col overflow-hidden">
    <TopBar user={user} />
    <main className="flex-1 overflow-y-auto p-6">
      {children}
    </main>
  </div>
</div>
```

Top bar keeps the existing role label + sign-out button but also adds the mobile hamburger.

---

## 5. Placeholder routes

Create empty pages so sidebar links don't 404:

- `app/(dashboard)/appointments/page.tsx`
- `app/(dashboard)/documents/page.tsx`
- `app/(dashboard)/communications/page.tsx`
- `app/(dashboard)/admin/users/page.tsx`
- `app/(dashboard)/admin/analytics/page.tsx`
- `app/(dashboard)/admin/settings/page.tsx`

Each shows a `PageHeader` with "Coming in Milestone X" description.

---

## 6. Acceptance criteria

- [ ] shadcn components installed and committed
- [ ] `ProspectStatus` constants match database enum
- [ ] `PageHeader`, `StatusBadge`, `DataTable`, `ProspectCard` compile with no errors
- [ ] Sidebar renders correctly for all 4 roles (test by swapping role in DB)
- [ ] Sidebar collapses to icon-only on desktop, becomes a Sheet on mobile
- [ ] Active route is highlighted
- [ ] All sidebar links navigate without 404
- [ ] No TypeScript errors, no `any`

---

## 7. Pitfalls to avoid

- **Don't** put role filtering only in the sidebar — the actual routes also need a role check in their layout or middleware. Hiding a link ≠ securing a page.
- **Don't** use `usePathname() === href` — use `startsWith` so nested routes still highlight their parent.
- **Don't** ship the sidebar without a mobile Sheet — the dashboard must be usable at 375px wide.
