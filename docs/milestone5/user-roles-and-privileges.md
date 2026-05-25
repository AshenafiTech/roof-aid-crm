# User, Role, and Privilege Management

**Milestone:** M5 (extension)
**Status:** Specification — pending implementation
**Audience:** Engineers, product, and tenant administrators
**Inspired by:** the OpenMRS user / role / privilege model, adapted to Roof-Aid's multi-tenant CRM and field operations

---

## 1. Overview

Roof-Aid CRM uses a three-tier access model:

```
┌─────────────┐ many-to-many ┌─────────┐ many-to-many ┌────────────┐
│    User     │ ───────────► │  Role   │ ───────────► │ Privilege  │
└─────────────┘              └─────────┘              └────────────┘
                                  │                          │
                                  │ inherits                 │ checked by
                                  ▼                          ▼
                             ┌─────────┐              ┌──────────────┐
                             │  Role   │              │ Server Action│
                             │ (parent)│              │ / RLS / UI   │
                             └─────────┘              └──────────────┘
```

- A **User** is a person (or service principal) that authenticates against the system. Users are scoped to one tenant.
- A **Role** is a named bundle of privileges (and optionally inherited roles). Tenant admins assign one role to each user.
- A **Privilege** is a single, fine-grained permission to perform one action (e.g., `Edit Prospects`, `Delete Documents`). Privileges are platform-defined; tenants don't invent new ones.

This document describes:

1. The conceptual model (Section 2)
2. The four pre-defined roles for Milestone-5 (Section 3)
3. The complete privilege catalog derived from the existing codebase (Section 4)
4. How privileges are enforced across UI, server actions, and RLS (Section 5)
5. The dynamic role management UI under **Settings → Roles** (Section 6)
6. The database schema (Section 7)
7. The migration plan from the existing hard-coded `role` column to the new model (Section 8)
8. Edge cases and policy rules (Section 9)

---

## 2. Conceptual Model

### 2.1 User

Each authenticated person has a row in `public.users` (FK to `auth.users.id`). A user has exactly **one tenant** and exactly **one role** within that tenant. (Multi-role membership is out of scope — see Section 9.4 for rationale.)

### 2.2 Role

A role is a named, tenant-scoped (or platform-scoped) collection of privileges. A role can also **inherit** privileges from one or more parent roles — the resulting privilege set is the union.

Roles fall into two categories:

| Category | Source | Editable? | Examples |
|----------|--------|-----------|----------|
| **System role** | Seeded by the platform; immutable name + slug | Privileges can be reviewed but not removed for `Owner` / `Super Admin`. Names cannot be changed. | `Owner`, `Admin`, `Telefonista`, `Rufero`, `Super Admin` |
| **Custom role** | Created by a tenant admin via Settings → Roles | Fully editable (name, description, privileges, parents) | `Senior Telefonista`, `Read-Only Auditor`, `Sales Manager` |

### 2.3 Privilege

A privilege is a platform-defined string identifier that maps 1:1 to a guarded action in code. Privileges are **not user-creatable** — they are introduced by engineers and surface in the Roles UI as a checklist.

Privileges follow the convention `<Verb> <Resource>`:

- `View Prospects`
- `Edit Prospects`
- `Delete Documents`
- `Manage Phone Numbers`
- `Use Softphone`
- `Sign Documents As Company`

Display labels are human-readable; the canonical identifier is a snake_case slug (`view_prospects`, `edit_prospects`, etc.) used in code and the database.

### 2.4 The check

Every guarded action becomes:

```ts
if (!hasPrivilege(currentUser, "edit_prospects")) {
  throw new Error("Not authorized");
}
```

or its declarative equivalent in RLS:

```sql
USING (public.user_has_privilege(auth.uid(), 'edit_prospects'))
```

Today's code uses **role string comparisons** (`role === "owner"`, `["admin","owner"].includes(role)`). The migration replaces every one of those with a privilege check, leaving the role names purely as bundles.

---

## 3. Default Roles

These four roles ship with every new tenant. They cannot be deleted (only their privilege sets are tunable, with the exceptions in 3.1). A fifth platform-level role, `Super Admin`, lives outside any tenant.

### 3.1 Role definitions

| Role | Slug | Login channel | Removable? | Privileges editable? | Purpose |
|------|------|---------------|------------|----------------------|---------|
| **Owner** | `owner` | Web + Mobile | No — one per tenant | No — always **all** privileges | The tenant's first user. Created at signup. Cannot be deleted by anyone (including other owners). Full access to billing, settings, users, and all data. |
| **Admin** | `admin` | Web + Mobile | Yes | Yes — but always at least the "admin" baseline | Office manager. Can do anything an Owner can **except** delete the Owner, transfer ownership, or change another Owner's role. |
| **Telefonista** | `telefonista` | Web + Mobile | Yes | Yes | Call agent. Searches, contacts, schedules prospects. Cannot access **Settings**, **User Management**, **Analytics** (admin-tier), or billing. |
| **Rufero** | `rufero` | **Mobile only** | Yes | Yes | Field inspector. Cannot log into the web app. Logs in on the mobile app (typically phone-number-based auth). Sees only the prospects and appointments **assigned to them**. |
| **Super Admin** | `super_admin` | Web + Mobile (cross-tenant) | No | No | Platform staff. Cross-tenant read/write for support and billing. Not visible in the per-tenant Roles UI. |

### 3.2 What each role can do — at a glance

Legend: ✅ full, ◐ partial / own records only, ❌ none

| Capability | Owner | Admin | Telefonista | Rufero |
|---|---|---|---|---|
| Log into **web** | ✅ | ✅ | ✅ | ❌ |
| Log into **mobile** | ✅ | ✅ | ✅ | ✅ |
| View prospects | ✅ all | ✅ all | ✅ all | ◐ assigned only |
| Create / edit prospects | ✅ | ✅ | ✅ | ❌ |
| Delete prospects | ✅ | ✅ | ❌ | ❌ |
| Assign prospects to ruferos | ✅ | ✅ | ❌ | ❌ |
| Change prospect status | ✅ any | ✅ any | ◐ not from `not_viable` | ◐ from `scheduled` → `closed_customer` / `not_viable` only |
| Schedule appointments | ✅ | ✅ | ✅ | ❌ |
| View appointments | ✅ all | ✅ all | ✅ all | ◐ own only |
| Cancel / reschedule appointments | ✅ | ✅ | ✅ | ❌ |
| Complete / mark no-show (in field) | ✅ | ✅ | ❌ | ✅ (own) |
| Manage rufero availability blocks | ✅ | ✅ | ❌ | ✅ (own) |
| Generate documents | ✅ | ✅ | ✅ | ❌ |
| Sign documents as company | ✅ | ✅ | ❌ | ❌ |
| Delete documents | ✅ | ✅ | ❌ | ❌ |
| Use softphone (Telnyx WebRTC) | ✅ | ✅ | ✅ | ❌ |
| Send SMS / Email | ✅ | ✅ | ✅ | ❌ |
| Connect Google account (Gmail send) | ✅ | ❌ | ✅ | ❌ |
| View activities / audit log | ✅ | ✅ | ❌ | ❌ |
| View analytics dashboard | ✅ | ✅ | ❌ | ❌ |
| Capture inspection (photos + form) | ❌ | ❌ | ❌ | ✅ |
| **Access Settings menu** | ✅ | ✅ | ❌ | ❌ |
|   ↳ Manage phone numbers | ✅ | ✅ | ❌ | ❌ |
|   ↳ Edit document templates | ✅ | ❌ | ❌ | ❌ |
|   ↳ Edit company signature | ✅ | ❌ | ❌ | ❌ |
|   ↳ Manage notification preferences | ✅ | ✅ | ✅ | ✅ (own) |
|   ↳ **Manage roles & privileges** | ✅ | ❌ | ❌ | ❌ |
| **Manage users** | ✅ | ◐ all except Owner | ❌ | ❌ |
|   ↳ Invite user | ✅ | ✅ (cannot invite as Owner) | ❌ | ❌ |
|   ↳ Edit user profile | ✅ | ✅ (cannot edit Owner) | ❌ | ❌ |
|   ↳ Change a user's role | ✅ | ✅ (cannot promote to Owner; cannot demote Owner) | ❌ | ❌ |
|   ↳ Deactivate user | ✅ | ✅ (cannot deactivate Owner; cannot deactivate self) | ❌ | ❌ |
|   ↳ **Delete user** | ✅ | ❌ (cannot delete Owner — explicit rule) | ❌ | ❌ |
|   ↳ Reset another user's password | ✅ | ✅ (cannot reset Owner's password) | ❌ | ❌ |

> **The hard rule for Admin:** "can do anything an Owner can, except **anything that touches the Owner account** and **anything in `Settings → Roles`** (which is the lever that could grant itself Owner privileges)." This is enforced both by privilege absence (Admin lacks `manage_roles`, `delete_owner`) and by explicit guard rails on the Owner row.

---

## 4. Privilege Catalog

The catalog below is the **complete, audited list** of privileges derived from a code review of every guard in `apps/web/`, every RLS policy in `supabase/migrations/`, and every navigation rule in `nav-items.ts`. It is grouped by domain. Each entry lists:

- **Slug** — canonical identifier used in code and DB
- **Display name** — shown in the Roles UI checklist
- **Default roles** — which seeded roles have it on a fresh tenant
- **Enforced at** — where the check lives (UI / Server Action / RLS / Middleware)
- **Notes** — edge cases, dependencies, or scoping rules

### 4.1 Prospects & Leads

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `view_prospects` | View Prospects | O, A, T, R | RLS + page guards | Rufero sees only `assigned_to = self`. |
| `view_all_prospects` | View All Prospects (across assignment) | O, A, T | RLS | Distinguishes "see everything" vs. "see assigned." Required to bypass rufero's per-row filter. |
| `create_prospects` | Create Prospects | O, A, T | Server action + RLS | |
| `edit_prospects` | Edit Prospects | O, A, T | Server action + RLS | Replaces `canEditProspect()`. |
| `delete_prospects` | Delete Prospects | O, A | RLS | |
| `assign_prospects` | Assign Prospects to Ruferos | O, A | Server action | Replaces `canAssignProspects()` for prospect-level assignment. |
| `bulk_assign_prospects` | Bulk Assign Prospects | O, A | Server action | |
| `change_prospect_status` | Change Prospect Status | O, A | Server action | Owner / Admin: any transition. |
| `change_prospect_status_limited_telefonista` | Change Prospect Status (Telefonista subset) | T | Server action | Cannot transition out of `not_viable`. |
| `change_prospect_status_limited_rufero` | Change Prospect Status (Rufero subset) | R | Server action | Only `scheduled` → `closed_customer` / `not_viable`. |
| `mark_dnc` | Mark Prospect as Do-Not-Call | O, A, T | Server action + RLS | DNC compliance — see SRS rules. |
| `search_prospects` | Search Prospects | O, A, T, R | RLS-scoped | Free-text + proximity. Rufero still constrained by assignment. |

### 4.2 Appointments

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `view_appointments` | View Appointments | O, A, T, R | RLS + page guards | Rufero sees only `rufero_id = self`. |
| `view_all_appointments` | View All Appointments | O, A, T | RLS | |
| `create_appointments` | Create Appointments | O, A, T | Server action + RLS | |
| `edit_appointments` | Edit Appointments | O, A, T | Server action + RLS | |
| `delete_appointments` | Delete Appointments | O, A | RLS | |
| `assign_appointment_rufero` | Assign Rufero to Appointment | O, A | Server action | |
| `confirm_appointments` | Confirm Appointments | O, A, T | Server action | |
| `cancel_appointments` | Cancel Appointments | O, A, T | Server action | Reason required. |
| `reschedule_appointments` | Reschedule Appointments | O, A, T | Server action | |
| `complete_appointments` | Mark Appointment Complete | O, A, R | Server action | Rufero completes from field; admins for back-office cleanup. |
| `mark_appointment_no_show` | Mark Appointment No-Show | O, A, R | Server action | |
| `manage_own_availability` | Manage Own Availability (Blocks + Working Hours) | R | Mobile action + RLS | |
| `manage_any_availability` | Block / Edit Any Rufero's Availability | O, A | Server action | Admins blocking on behalf of a rufero. |

### 4.3 Documents

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `view_documents` | View Documents | O, A, T, R | RLS | Same-tenant. |
| `generate_documents` | Generate Documents | O, A, T | Server action + RLS | Calls `generate-pdf` Edge Function. |
| `edit_documents` | Edit Documents (text fields) | O, A, T | Server action | Telefonista edits on a single document never overwrite the tenant template (per existing rule). |
| `upload_documents` | Upload Documents | O, A, T | Server action | `source = 'upload'`. |
| `download_documents` | Download Documents | O, A, T, R | Signed-URL action | All roles can download docs visible to them. |
| `sign_documents_as_company` | Sign Documents as Company Representative | O, A | Server action | Replaces hardcoded `["owner","admin","super_admin"]` check in `signDocument`. |
| `delete_documents` | Delete Documents | O, A | Server action | Soft-delete keeps audit row. |
| `manage_document_templates` | Manage Document Templates | O | Server action | Owner-only baseline. |
| `manage_company_signature` | Manage Company Signature | O | Server action | Owner-only baseline. |

### 4.4 Communications

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `use_softphone` | Use Softphone (Telnyx WebRTC) | O, A, T | `/api/telnyx/credentials` | Replaces `ROLES_THAT_GET_SOFTPHONE`. |
| `send_sms` | Send SMS | O, A, T | Server action | Tenant `can_message()` RPC still gates. |
| `send_email` | Send Email (manual) | O, T | Server action | Today this is owner+telefonista only — Admin is excluded by design (Sendgrid sender identity is tied to the person sending). |
| `connect_google_account` | Connect Google Account (Gmail send) | O, T | OAuth route | Mirrors `send_email`. |
| `view_call_logs` | View Call Logs | O, A, T | RLS | |
| `view_sms_logs` | View SMS Conversations | O, A, T | RLS | |
| `view_email_logs` | View Email Logs | O, A, T | RLS | |

### 4.5 Notes & Activities

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `view_notes` | View Notes | O, A, T, R | RLS | |
| `add_notes` | Add Notes | O, A, T, R | Server action + RLS | |
| `edit_own_notes` | Edit / Delete Own Notes | O, A, T, R | RLS (`author_id = auth.uid()`) | |
| `view_activities` | View Activities (Audit Log) | O, A | RLS | Owner + Admin only — keeps the audit feed scoped to managers. |

### 4.6 Inspections (Mobile)

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `create_inspection_reports` | Create Inspection Reports | O, A, R | RLS + mobile action | |
| `edit_inspection_reports` | Edit Inspection Reports | O, A, R | RLS | Rufero only their own. |
| `capture_inspection_photos` | Capture Inspection Photos | R | Mobile screen guard | |
| `capture_homeowner_signature` | Capture Homeowner Signature | R | Mobile screen guard | Distinct from `sign_documents_as_company`. |

### 4.7 Settings

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `access_settings` | Access Settings Section | O, A | Nav guard + page guards | The umbrella that controls the **Settings** sidebar entry. Telefonistas don't see it at all. |
| `manage_phone_numbers` | Manage Phone Numbers | O, A | Server action | |
| `manage_notification_preferences` | Manage Tenant Notification Preferences | O, A | Server action | Per-user preferences (`manage_own_notifications`) is separate. |
| `manage_own_notifications` | Manage Own Notification Preferences | O, A, T, R | RLS | |
| `manage_users` | Manage Users (Invite, Edit, Deactivate) | O, A | Page + server action | |
| `delete_users` | Delete Users | O | Server action | **Owner-only**. Admin cannot delete users in this model. (See 9.2 for why.) |
| `manage_roles` | Manage Roles & Privileges | O | Page + server action | The role-editor itself. **Owner-only baseline** so Admin can't grant themselves Owner powers. |
| `manage_billing` | Manage Billing & Plan | O | Page (future) | Stripe surfaces — Owner only. |
| `manage_tenant_settings` | Manage Tenant General Settings | O, A | Server action | Working hours, timezone, branding, etc. |

### 4.8 Analytics

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `view_analytics` | View Analytics Dashboard | O, A | Page guard | |
| `export_analytics` | Export Analytics (CSV / report) | O | Page (future) | |

### 4.9 Onboarding & Tenant

| Slug | Display name | Defaults | Enforced at | Notes |
|---|---|---|---|---|
| `complete_onboarding` | Complete Tenant Onboarding | O, A | `app/onboarding/actions.ts` | |
| `view_tenants` | View All Tenants | (super_admin) | RLS | Platform-only privilege; not assignable to tenant roles. |
| `manage_tenants` | Create / Suspend Tenants | (super_admin) | RLS | Platform-only. |
| `manage_platform_config` | Manage Platform Config | (super_admin) | RLS | Platform-only. |

### 4.10 Login channels (special "negative" privilege)

Login channel is a **role attribute**, not a regular privilege — it gates *whether the user can authenticate against a given surface at all*, before any privilege check happens.

| Attribute | Owner | Admin | Telefonista | Rufero |
|---|---|---|---|---|
| `login_web` | ✅ | ✅ | ✅ | ❌ |
| `login_mobile` | ✅ | ✅ | ✅ | ✅ |

These are stored as boolean columns on the `roles` table (see Section 7) and checked in `middleware.ts` (web) and the mobile auth screen (mobile). Custom roles default to web + mobile = true.

---

## 5. Enforcement Layers

A correctly designed privilege system enforces the same rule **in multiple places** — UI hides the action, the server action refuses it, and RLS makes the underlying query return no rows. Each layer has a different failure mode (UI = "I see a 403," server = "I clicked through DevTools and got 403," RLS = "I crafted the SQL and the row isn't there").

### 5.1 UI guards (cosmetic)

- **Sidebar** (`nav-items.ts`): each `NavItem.roles` becomes `NavItem.privileges`, e.g.,
  ```ts
  { label: "Settings", href: "/admin/settings", privileges: ["access_settings"] }
  { label: "Documents", href: "/documents", privileges: ["view_documents"] }
  ```
  `filterNavForRole` becomes `filterNavForPrivileges(items, currentUser.privileges)`.
- **Action buttons** (e.g., the "Delete" button on a document row, the "Assign" button on a prospect): conditionally rendered via a small client helper:
  ```tsx
  <Can do="delete_documents">{children}</Can>
  ```
- **Pages**: server components check `requirePrivilege("view_analytics")` at the top, redirecting to `/dashboard` if absent.

### 5.2 Server actions (authoritative)

Every `"use server"` action in `app/(dashboard)/**/actions.ts` and `app/api/**` runs the privilege check **before any DB write**. Replaces the existing pattern:

**Today:**
```ts
if (!canAssignProspects(profile.role as UserRole)) {
  throw new Error("You don't have permission to reassign prospects");
}
```

**After migration:**
```ts
await requirePrivilege(profile, "assign_prospects");
```

A new helper `apps/web/lib/auth/require-privilege.ts` looks up the user's effective privileges (cached per request, see 7.4) and throws if absent.

### 5.3 Middleware (route-level)

`middleware.ts` already has `ROLE_ROUTES`. It becomes `PRIVILEGE_ROUTES`:

```ts
const PRIVILEGE_ROUTES: { prefix: string; required: string[] }[] = [
  { prefix: "/super-admin",   required: ["manage_tenants"] },
  { prefix: "/admin/users",   required: ["manage_users"] },
  { prefix: "/admin/settings/roles", required: ["manage_roles"] },
  { prefix: "/admin/settings", required: ["access_settings"] },
  { prefix: "/admin/analytics", required: ["view_analytics"] },
];
```

The user's effective privileges are stamped into the JWT `app_metadata` on login + role-change, so middleware can read them without a DB hop.

### 5.4 RLS (last line of defense)

A new SQL function `public.user_has_privilege(p_user uuid, p_priv text) RETURNS boolean` replaces literal `get_user_role() IN ('owner', 'admin')` clauses with `public.user_has_privilege(auth.uid(), 'delete_documents')`.

The function reads the user's role from the JWT, joins to `role_privileges`, and recurses into `role_parents` (with a CTE-cycle guard).

Performance: the result is cached per query plan via `STABLE` marking, and the role's privilege set is denormalized into a `roles.privileges_cache text[]` column refreshed by trigger on `role_privileges` writes.

---

## 6. Roles UI — Settings → Roles

A new page at `/admin/settings/roles` (privilege: `manage_roles`, default: Owner). Visible from `/admin/settings` as a new card.

### 6.1 List screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ Roles                                            [ + New Role ]      │
│ Define who can do what in your team.                                 │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ ● Owner (system)              1 user            22 privileges    │ │
│ │ ● Admin (system)              2 users           18 privileges    │ │
│ │ ● Telefonista (system)        4 users           11 privileges    │ │
│ │ ● Rufero (system)             6 users            6 privileges    │ │
│ │ ● Senior Telefonista (custom) 0 users           13 privileges  ⋯ │ │
│ │ ● Read-Only Auditor (custom)  1 user             4 privileges  ⋯ │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- The kebab on custom rows offers **Edit**, **Duplicate**, **Delete** (blocked if any user holds the role).
- System roles offer **Edit privileges** only — no rename, no delete.

### 6.2 Edit screen

Two-column layout:

- **Left:** Role identity (name, slug auto-derived, description, parent role(s), login channels web/mobile).
- **Right:** Privilege checklist, grouped by the domains in Section 4 (Prospects, Appointments, Documents, …). Each domain has a "Select all" / "Clear" link. Inherited privileges (from a parent) appear pre-checked and disabled, with a "Inherited from {Parent}" tag.

Saving recomputes `roles.privileges_cache`, stamps the new privilege set into the JWT of any logged-in user holding this role on next page navigation, and revalidates `/admin/settings/roles`.

### 6.3 Guard rails on system roles

The page enforces (both UI and server action):

1. **Owner**: privileges checklist is read-only (always all). Login channels are read-only (web + mobile).
2. **Admin**: cannot uncheck `manage_users`, `access_settings`. Cannot check `delete_users`, `manage_roles`, `manage_billing` (the "Owner-only" cluster). Attempting to violates returns a validation error explaining why.
3. **Rufero**: `login_web` is forced to `false` (the entire premise of the role). Attempting to flip it shows a confirmation dialog: *"Ruferos are field workers without web access by design. Are you sure you want to enable web login for this role?"* — if enabled, the role is effectively a new custom role; we warn but don't block.
4. **Super Admin** is not listed.

### 6.4 Assigning a role to a user

Today's User Management dialog (`apps/web/app/(dashboard)/admin/users/user-management.tsx`) already has a role selector hardcoded to `admin | telefonista | rufero`. The migration:

1. Replaces the hardcoded list with a fetch of `roles` where `is_assignable = true` and the role passes the assigner's authority check (see 6.5).
2. Hides `Owner` from the dropdown for non-owners.
3. Adds a separate **"Transfer ownership"** action (Owner only) that swaps the Owner role between two users in one atomic transaction.

### 6.5 Authority to assign a role

A user can assign role *R* to another user only if every privilege in *R* is a subset of the assigner's privileges, **and** the assigner has `manage_users`.

This prevents an Admin from accidentally creating a custom role with `delete_users` and then assigning it to themselves.

### 6.6 Permission to manage roles

By default only the Owner has `manage_roles`. The Owner can grant it to a custom role if needed (e.g., a "Security Officer" custom role), but `manage_roles` itself cannot be granted to the seeded `Admin` role from the UI — granting it requires editing a custom role and assigning that role to the Admin user. This is intentional friction: people who can edit roles can edit themselves, so the action requires a deliberate "I built a new role for this" step.

---

## 7. Database Schema

### 7.1 New tables

```sql
-- 7.1.1 ROLES
CREATE TABLE roles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL for platform roles
  slug                text NOT NULL,                                  -- 'owner', 'admin', 'senior_telefonista'
  name                text NOT NULL,
  description         text,
  is_system           boolean NOT NULL DEFAULT false,                 -- true for seeded roles
  is_assignable       boolean NOT NULL DEFAULT true,                  -- false for super_admin
  login_web           boolean NOT NULL DEFAULT true,
  login_mobile        boolean NOT NULL DEFAULT true,
  privileges_cache    text[] NOT NULL DEFAULT '{}',                   -- denormalized union including parents
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 7.1.2 PRIVILEGES (platform-defined; seeded by migrations)
CREATE TABLE privileges (
  slug                text PRIMARY KEY,                               -- 'edit_prospects'
  name                text NOT NULL,                                  -- 'Edit Prospects'
  domain              text NOT NULL,                                  -- 'prospects', 'appointments', ...
  description         text,
  is_platform_only    boolean NOT NULL DEFAULT false,                 -- super_admin-only privileges
  sort_order          int NOT NULL DEFAULT 0
);

-- 7.1.3 ROLE_PRIVILEGES (assignments)
CREATE TABLE role_privileges (
  role_id             uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  privilege_slug      text NOT NULL REFERENCES privileges(slug) ON DELETE CASCADE,
  PRIMARY KEY (role_id, privilege_slug)
);

-- 7.1.4 ROLE_PARENTS (inheritance — DAG)
CREATE TABLE role_parents (
  child_role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  parent_role_id      uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (child_role_id, parent_role_id),
  CHECK (child_role_id <> parent_role_id)
);

-- 7.1.5 USERS table gets a new role_id column.
ALTER TABLE users ADD COLUMN role_id uuid REFERENCES roles(id);
-- The legacy `role text` column stays during the migration window (8.1).
```

### 7.2 Helper function

```sql
CREATE OR REPLACE FUNCTION public.user_has_privilege(p_user uuid, p_priv text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = p_user
      AND p_priv = ANY (r.privileges_cache)
  );
$$;
```

(Super-admin shortcut: the seeded `super_admin` role's `privileges_cache` contains a sentinel `*` and the function is wrapped to return true if `*` is present.)

### 7.3 Trigger to refresh `privileges_cache`

```sql
CREATE OR REPLACE FUNCTION refresh_role_privileges_cache(p_role uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  result text[];
BEGIN
  WITH RECURSIVE role_chain AS (
    SELECT id FROM roles WHERE id = p_role
    UNION
    SELECT rp.parent_role_id FROM role_parents rp
    JOIN role_chain rc ON rc.id = rp.child_role_id
  )
  SELECT array_agg(DISTINCT rpr.privilege_slug)
    INTO result
  FROM role_chain rc
  JOIN role_privileges rpr ON rpr.role_id = rc.id;

  UPDATE roles SET privileges_cache = COALESCE(result, '{}'), updated_at = now()
   WHERE id = p_role;
END;
$$;
```

Triggers on `role_privileges` (INSERT/DELETE) and `role_parents` (INSERT/DELETE) call this for every affected role.

### 7.4 JWT stamping

When a user signs in or their role changes, `app_metadata.privileges` on `auth.users` is set to the role's `privileges_cache`. Middleware reads it without a DB hop. The user is forced to re-log if a stale token is detected (cache-version stamp).

### 7.5 RLS on the new tables

- **`roles`**: tenant-scoped; SELECT for any user in the tenant; INSERT/UPDATE/DELETE only with `manage_roles` privilege.
- **`role_privileges`** and **`role_parents`**: same, joined via `roles.tenant_id`.
- **`privileges`**: world-readable (it's a static catalog); no writes from app users — only migrations.

---

## 8. Migration Plan

### 8.1 Phase 0 — Shadow mode (1 PR)

- Create the four new tables (`roles`, `privileges`, `role_privileges`, `role_parents`).
- Seed the privilege catalog from Section 4.
- For every existing tenant, seed the four roles (Owner / Admin / Telefonista / Rufero) and populate `role_privileges` per Section 3.2.
- Backfill `users.role_id` from `users.role` (string → uuid by slug).
- **No code changes** — both `role` and `role_id` exist in parallel.

### 8.2 Phase 1 — `hasPrivilege()` plumbing (1 PR)

- Add `apps/web/lib/auth/privileges.ts` with `hasPrivilege(user, slug)` and `requirePrivilege(profile, slug)`.
- Add `<Can do="...">` client helper.
- Add `apps/web/lib/auth/role-store.ts` to keep `currentUser.privileges` in a React cache.
- **Tests** — unit tests against a static fixture map. No behavior change yet.

### 8.3 Phase 2 — Cut over enforcement (multiple PRs, one per domain)

Replace each role-string check with the corresponding `requirePrivilege` call. One PR per domain (prospects, appointments, documents, comms, settings, users). Each PR includes the migration of:
- The server actions in `app/(dashboard)/<domain>/actions.ts`
- The RLS policies in a new `038_privilege_rls.sql` (or per-domain migration)
- The nav items in `nav-items.ts`
- The middleware route guards

### 8.4 Phase 3 — Roles UI (1 PR)

- Build the `/admin/settings/roles` list + edit screens.
- Add the **Roles** card to `/admin/settings`.
- Move the role selector in User Management onto the new `roles` table.

### 8.5 Phase 4 — Drop the legacy column (1 PR)

After two weeks of production with no incidents:

- Drop `users.role`.
- Drop the legacy `get_user_role()` SQL function once no policy references it.
- Remove the legacy `UserRole` type's hardcoded union; replace with a fetched-at-runtime role slug + privileges.

### 8.6 Order of execution checklist

```
[ ] 8.1  Shadow tables + seed
[ ] 8.2  hasPrivilege() + tests
[ ] 8.3a Cut over Prospects domain
[ ] 8.3b Cut over Appointments domain
[ ] 8.3c Cut over Documents domain
[ ] 8.3d Cut over Communications domain
[ ] 8.3e Cut over Settings + Users domain
[ ] 8.4  Roles UI shipped
[ ] 8.5  Drop legacy column
```

---

## 9. Edge cases & policy rules

### 9.1 Owner cannot be deleted, ever

The `delete_users` server action explicitly rejects deletion of any user with the Owner role. The Owner role itself has no `delete_users` self-target rule — a user cannot delete themselves regardless of privileges (already enforced in `deleteUser` and `toggleUserActive`).

### 9.2 Admin cannot delete users at all (in this model)

Today's code allows `requireOwner()` (which permits owner + super_admin) to delete users. The new model **removes `delete_users` from Admin's default privileges** — only the Owner deletes. Admins deactivate. The user can still re-grant `delete_users` to Admin via a custom role if their team prefers the old model.

**Rationale:** Deleting a user cascades into FK fan-out (assignments, activities). Forcing this through one authority reduces the blast radius of an Admin-account compromise.

### 9.3 Transferring ownership

A dedicated server action `transferOwnership(toUserId)`:

1. Requires the caller to *be* the Owner.
2. Atomically swaps `role_id` between the two users (Owner ↔ target's prior role) in a transaction.
3. Re-stamps both users' JWT `app_metadata`.
4. Logs to `activities` with `type = 'ownership_transfer'`.

There is always exactly one Owner per tenant — `roles` slug `owner` has a partial unique index on `(tenant_id)` over `users.role_id` to enforce this.

### 9.4 Multi-role memberships are out of scope

OpenMRS supports multi-role users (the privilege set is the union). Roof-Aid sticks with single-role-per-user in M5 because:

1. Every guard in today's code reads a single `role`.
2. The four target roles cover ~95% of tenant needs.
3. Adding multi-role doubles the surface area of every check.

If a tenant needs "Telefonista + light admin," the answer is **a custom role** that bundles the privileges, not multi-role.

### 9.5 Rufero login channel

Rufero's `login_web = false` is enforced at three layers:

1. **Middleware** rejects authenticated `role.login_web = false` users on any non-`/login` web route, redirecting to a "This account is field-only — use the mobile app" page.
2. **The login form** does not surface email/password for ruferos (mobile uses phone OTP).
3. **The Roles UI** flips `login_web` to `false` for the Rufero system role with a "highly recommended" lock.

A tenant that *needs* a hybrid rufero can clone the Rufero role into a custom "Field + Web Rufero" role with `login_web = true`. That's an explicit decision the Owner makes — not the default.

### 9.6 Privileges added by future engineering

When a new domain or guarded action lands, the engineer:

1. Adds a `privileges` row in a migration.
2. Adds the privilege to the default `role_privileges` rows for the roles that historically had access (so production behavior doesn't drift on deploy).
3. References the new slug in code via `requirePrivilege("…")`.

A linter/test catches direct string comparisons of `role` outside `lib/auth/`.

### 9.7 Caching invalidation

When the Owner edits the Admin role's privileges, every Admin user's JWT becomes stale. We solve this with a `roles.cache_version int` bumped on every save; middleware compares the JWT-stamped version to the live row's version and forces a token refresh if behind. The refresh re-stamps `app_metadata.privileges` from `privileges_cache`.

### 9.8 What's deliberately *not* a privilege

A few capabilities are tied to ownership of the underlying row (the user "owns" the row) and don't need a privilege check beyond "you can view it":

- **Editing your own notes** — gated by `notes.author_id = auth.uid()` in RLS, not a privilege.
- **Reading your own notifications** — `notifications.user_id = auth.uid()`.
- **Managing your own availability blocks (as a rufero)** — `availability_blocks.rufero_id = auth.uid()`.

These row-ownership rules complement the privilege model rather than competing with it.

### 9.9 Audit

Every role / privilege change is logged to `activities` with one of:
- `role_created`, `role_updated`, `role_deleted`
- `role_privilege_granted`, `role_privilege_revoked`
- `user_role_changed`

This feeds the existing Audit Log surface (Owner + Admin via `view_activities`).

---

## 10. Definition of Done

- [ ] `roles`, `privileges`, `role_privileges`, `role_parents` tables shipped and seeded
- [ ] Every existing `role === "..."`-style check in `apps/web/` replaced with `requirePrivilege(...)`
- [ ] All RLS policies use `user_has_privilege(...)` instead of `get_user_role() = '...'` comparisons
- [ ] `/admin/settings/roles` page shipped with list, edit, create, duplicate, delete (custom only) flows
- [ ] User Management dropdown reads from `roles` table; assigning a role honors authority rules (6.5)
- [ ] Middleware blocks Rufero from web routes with the field-only landing page
- [ ] Owner cannot be deleted, deactivated, or demoted by anyone
- [ ] Admin cannot grant themselves Owner-only privileges via custom roles (subset rule enforced)
- [ ] JWT carries `privileges` array; cache invalidates on role edits
- [ ] Cross-tenant test: a custom role created in Tenant A is invisible in Tenant B
- [ ] All four default roles match the matrix in Section 3.2 on a freshly created tenant
- [ ] Audit entries written for every role/privilege change
- [ ] Documentation cross-linked from `/docs/milestone5/README.md`

---

## 11. References

- Existing role string usage: `apps/web/lib/auth/permissions.ts`, `apps/web/lib/types/auth.ts`
- Existing RLS: `supabase/migrations/006_rls.sql`
- Existing user management: `apps/web/app/(dashboard)/admin/users/`
- Existing settings shell: `apps/web/app/(dashboard)/admin/settings/page.tsx`
- Existing nav guard: `apps/web/app/(dashboard)/nav-items.ts`
- Auth helpers: `supabase/migrations/004b_auth_functions_DASHBOARD_ONLY.sql`
- Inspiration: [OpenMRS User, Role, Privilege model](https://wiki.openmrs.org/display/docs/Managing+Users+Roles+and+Privileges)
