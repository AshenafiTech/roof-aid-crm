# Roles & Privileges — Implementation Notes

**Date:** 2026-05-23
**Companion to:** [`user-roles-and-privileges.md`](./user-roles-and-privileges.md) (spec) and [`../roles-permissions.md`](../roles-permissions.md) (default policy)
**Status:** Phase 0 shipped — DB schema, helpers, Roles UI, and key cut-overs live; deeper RLS + middleware migration is follow-up work

---

## 1. Purpose

Add a dynamic user / role / privilege management system to Roof-Aid CRM. By default it ships the four roles described in `docs/roles-permissions.md` (Owner, Admin, Telefonista, Rufero) with the privilege bundles that match today's behavior. The Owner can then customize any role — or create new custom roles — from **Settings → Roles & privileges**.

---

## 2. What was shipped

### 2.1 Database (migration `038_roles_and_privileges.sql`)

- **New tables:** `roles`, `privileges`, `role_privileges`, `role_parents`.
- **New column:** `users.role_id uuid` (nullable during the transition window).
- **Privilege catalog** seeded with 50+ slugs grouped by domain — prospects, appointments, documents, communications, notes, inspections, settings, analytics.
- **Default roles** seeded per-tenant via `public.seed_default_roles(p_tenant_id uuid)`:
  - `owner` → `is_super_role = true` (every privilege — current and future), `login_web = true`, `login_mobile = true`
  - `admin` → broad privilege set, no `manage_roles`, no `manage_billing` (those are Owner-only by code constant). `delete_users` is granted, but a row-level guard still prevents deleting/editing the Owner account.
  - `telefonista` → contact / sales subset, **no settings access**, no user management, no DNC-bypass.
  - `rufero` → field-only subset, `login_web = false`, `login_mobile = true`.
- **Backfill:** every existing user's `role_id` is set to the matching tenant role row (super_admins keep `role_id = null` and use the legacy fallback).
- **Helper functions:**
  - `public.user_has_privilege(user uuid, slug text) → boolean` — short-circuits on `is_super_role` and falls back to the legacy `users.role` column when `role_id` is null.
  - `public.current_user_has_privilege(slug text)` — convenience wrapper used by RLS.
  - `public.refresh_role_privileges_cache(role uuid)` — recomputes `roles.privileges_cache` (the denormalized union including parents) and bumps `cache_version`.
- **Triggers:** `role_privileges` and `role_parents` writes auto-refresh the affected role + every descendant.
- **RLS:** the new tables are tenant-scoped; writes require `current_user_has_privilege('manage_roles')`. The privileges catalog itself is world-readable.

### 2.2 TypeScript types & helpers

- **`apps/web/lib/types/auth.ts`** — `AuthUser` gains `roleId`, `privileges: string[]`, and `isSuperRole: boolean`.
- **`apps/web/lib/supabase/roles-augment.ts`** — hand-written row/insert/update types for the four new tables, plus a `withRoles(client)` cast that returns an extended `SupabaseClient` so queries against the new tables are typed. Will be obsolete once `supabase gen types` is rerun against the post-038 schema.
- **`apps/web/lib/auth/privileges.ts`** — `hasPrivilege`, `hasAllPrivileges`, `hasAnyPrivilege`, `requirePrivilege`, `requireAnyPrivilege`. Super-roles short-circuit to true.
- **`apps/web/lib/auth/current-user.ts`** — now loads the user's role row (privilege cache, super-role flag, login channels) alongside the profile.

### 2.3 Roles UI under `/admin/settings/roles`

- **List page** (`page.tsx` + `roles-list.tsx`):
  - Shows every role with user count, privilege count, login-channel summary.
  - System badge vs. Custom badge. "Super role" pill on the Owner row.
  - **New Role** dialog: name, description, login channels, optional "clone privileges from" dropdown (excluding the Owner super-role).
  - Delete only for custom roles, blocked if any user holds it.
- **Edit page** (`[id]/page.tsx` + `[id]/role-editor.tsx`):
  - Left card — identity (name, description, login web/mobile). Owner is locked. Rufero shows an amber warning when web login is enabled (defies the field-only convention).
  - Right card — privileges grouped by domain (Prospects, Appointments, Documents, Communications, Notes, Inspections, Settings, Analytics).
    - Each domain has **Select all** / **Clear** quick toggles.
    - **Owner-only privileges** (`manage_roles`, `manage_billing`) are visible but locked with an amber pill.
    - **Owner role** itself is fully locked (every privilege checked, no UI to remove them) — its set is computed automatically.
  - Save button only enables when dirty; uses `setRolePrivileges` to diff against the server set.

### 2.4 Settings index integration

- **`/admin/settings`** now redirects users without `access_settings` privilege to `/dashboard`.
- A new **Roles & privileges** card appears when the current user has `manage_roles` (Owner only by default).

### 2.5 User Management cut-over (`/admin/users`)

- Page guard switched from "role === owner | super_admin" to `hasPrivilege("manage_users")` → Admin can now reach the page (per `docs/roles-permissions.md`).
- `requireOwner()` renamed to `requireUserMgmt()` and now privilege-checks `manage_users`.
- `deleteUser` additionally requires `delete_users`.
- `inviteUser` and `editUser` look up the matching role's `id` and write `role_id` alongside the legacy `role` string. This keeps the new privilege machinery in sync without changing the existing UI.
- The "Delete User" menu item is hidden in the UI for users who lack `delete_users` (the action also enforces server-side).
- The existing Owner-row guards (`target.role === 'owner'` checks) are preserved untouched — they still prevent any role from editing, deactivating, deleting, or resetting another Owner.

### 2.6 Document actions cut-over

- `deleteDocument` switched from `["admin","owner","super_admin"].includes(role)` to `hasPrivilege("delete_documents")`.
- `signDocument` (company-rep signing) switched to `requirePrivilege("sign_documents_as_company")`.
- Both now react immediately when the Owner edits Admin's privilege set in the Roles UI.

### 2.7 Signup / new-tenant flow

- `app/(auth)/signup/actions.ts` calls `seed_default_roles(tenant_id)` via RPC right after tenant creation, then resolves the seeded Owner role and stamps `role_id` on the freshly-created owner user. The call is idempotent so a retry doesn't double-seed.

---

## 3. Default privilege matrix

Source of truth lives in `supabase/migrations/038_roles_and_privileges.sql` (`seed_default_roles`). The table below reproduces it for quick reference.

| Privilege                          | Owner | Admin | Telefonista | Rufero |
|-----------------------------------|:-----:|:-----:|:-----------:|:------:|
| view_prospects                    |  ✅   |  ✅   |     ✅      |   ✅   |
| view_all_prospects                |  ✅   |  ✅   |     ✅      |        |
| create_prospects                  |  ✅   |  ✅   |     ✅      |        |
| edit_prospects                    |  ✅   |  ✅   |     ✅      |        |
| delete_prospects                  |  ✅   |  ✅   |             |        |
| assign_prospects                  |  ✅   |  ✅   |             |        |
| change_prospect_status            |  ✅   |  ✅   |     ✅      |        |
| mark_dnc                          |  ✅   |  ✅   |     ✅      |        |
| view_appointments                 |  ✅   |  ✅   |     ✅      |   ✅   |
| view_all_appointments             |  ✅   |  ✅   |     ✅      |        |
| create_appointments               |  ✅   |  ✅   |     ✅      |        |
| edit_appointments                 |  ✅   |  ✅   |     ✅      |        |
| delete_appointments               |  ✅   |  ✅   |             |        |
| assign_appointment_rufero         |  ✅   |  ✅   |             |        |
| cancel_appointments               |  ✅   |  ✅   |     ✅      |        |
| reschedule_appointments           |  ✅   |  ✅   |     ✅      |        |
| complete_appointments             |  ✅   |  ✅   |             |   ✅   |
| mark_appointment_no_show          |  ✅   |  ✅   |             |   ✅   |
| manage_own_availability           |  ✅   |       |             |   ✅   |
| manage_any_availability           |  ✅   |  ✅   |             |        |
| view_documents                    |  ✅   |  ✅   |     ✅      |   ✅   |
| generate_documents                |  ✅   |  ✅   |     ✅      |        |
| upload_documents                  |  ✅   |  ✅   |     ✅      |        |
| download_documents                |  ✅   |  ✅   |     ✅      |   ✅   |
| sign_documents_as_company         |  ✅   |  ✅   |             |        |
| delete_documents                  |  ✅   |  ✅   |             |        |
| manage_document_templates         |  ✅   |  ✅   |             |        |
| manage_company_signature          |  ✅   |  ✅   |             |        |
| use_softphone                     |  ✅   |  ✅   |     ✅      |        |
| send_sms                          |  ✅   |  ✅   |     ✅      |        |
| send_email                        |  ✅   |  ✅   |     ✅      |        |
| connect_google_account            |  ✅   |  ✅   |     ✅      |        |
| view_call_logs / view_sms_logs / view_email_logs | ✅ | ✅ | ✅ |   |
| view_notes / add_notes            |  ✅   |  ✅   |     ✅      |   ✅   |
| view_activities                   |  ✅   |  ✅   |             |        |
| create / edit inspection_reports  |  ✅   |       |             |   ✅   |
| capture_inspection_photos         |  ✅   |       |             |   ✅   |
| capture_homeowner_signature       |  ✅   |       |             |   ✅   |
| access_settings                   |  ✅   |  ✅   |             |        |
| manage_phone_numbers              |  ✅   |  ✅   |             |        |
| manage_notification_preferences   |  ✅   |  ✅   |             |        |
| manage_own_notifications          |  ✅   |  ✅   |     ✅      |   ✅   |
| manage_users                      |  ✅   |  ✅   |             |        |
| delete_users                      |  ✅   |  ✅   |             |        |
| **manage_roles**                  |  ✅   |       |             |        |
| **manage_billing**                |  ✅   |       |             |        |
| manage_tenant_settings            |  ✅   |  ✅   |             |        |
| view_analytics                    |  ✅   |  ✅   |             |        |
| export_analytics                  |  ✅   |       |             |        |

`manage_roles` and `manage_billing` are flagged in `OWNER_ONLY_PRIVILEGES` in `actions.ts`. The Roles UI refuses to grant them to anything other than the Owner role.

---

## 4. Files added / changed

```
supabase/migrations/
  038_roles_and_privileges.sql                                                    (new)

apps/web/lib/
  types/auth.ts                                                                   (changed — new fields on AuthUser)
  supabase/roles-augment.ts                                                       (new — row types + withRoles cast)
  auth/current-user.ts                                                            (changed — loads privileges + super-role)
  auth/privileges.ts                                                              (new — hasPrivilege / requirePrivilege)

apps/web/app/(dashboard)/admin/settings/
  page.tsx                                                                        (changed — access_settings guard, Roles card)
  roles/actions.ts                                                                (new — list / get / create / update / toggle / setMany / delete)
  roles/page.tsx                                                                  (new — Roles list)
  roles/roles-list.tsx                                                            (new — client component)
  roles/[id]/page.tsx                                                             (new — Role edit)
  roles/[id]/role-editor.tsx                                                      (new — client component)

apps/web/app/(dashboard)/admin/users/
  page.tsx                                                                        (changed — manage_users privilege gate, canDelete flag)
  actions.ts                                                                      (changed — requireUserMgmt, role_id sync, delete_users check)
  user-management.tsx                                                             (changed — canDelete prop hides Delete menu item)

apps/web/app/(dashboard)/documents/
  actions.ts                                                                      (changed — deleteDocument, signDocument now privilege-based)

apps/web/app/(auth)/signup/
  actions.ts                                                                      (changed — seed_default_roles RPC + Owner role_id stamp)

docs/milestone5/
  user-roles-and-privileges.md                                                    (already existed — original spec)
  roles-permissions-implementation.md                                             (this file)
```

---

## 5. How to test

### 5.1 Apply the migration

```bash
# Local supabase
supabase db push
# or via psql for a hosted instance:
psql "$SUPABASE_DB_URL" -f supabase/migrations/038_roles_and_privileges.sql
```

### 5.2 Manual smoke

1. **Owner sees the Roles card.** Sign in as the tenant Owner → Settings → see "Roles & privileges" card → click in → see all four system roles + their privilege counts + user counts.
2. **Admin does not see Settings → Roles.** Sign in as an Admin → Settings opens normally → the "Roles & privileges" card is not rendered → trying `/admin/settings/roles` directly redirects to `/admin/settings`.
3. **Owner edits Admin privileges.** Open the Admin role → uncheck `delete_documents` → Save. Sign in as that Admin in another window → Documents page → "Delete" action throws "You don't have permission to delete documents."
4. **Owner role is locked.** Open the Owner role → privilege checklist is fully checked, every entry disabled → identity card shows the amber "Super role" notice.
5. **Custom role round-trip.** Create a "Senior Telefonista" role → clone from Telefonista → add `view_analytics` → save → role appears in the list with 1 / N privileges.
6. **Telefonista cannot reach Settings.** Sign in as a Telefonista → Settings link still in the sidebar (legacy nav rule) but visiting redirects to `/dashboard`.
7. **Rufero web login.** The Rufero role's `login_web` is false in the DB. (Web middleware enforcement is follow-up work — see Section 6.)
8. **New tenant signup.** Create a brand-new tenant via the signup wizard → check `roles` rows for that tenant — four system roles exist; the new Owner has `role_id` pointing at the Owner row.

### 5.3 SQL sanity checks

```sql
-- Every tenant has the 4 default roles
SELECT t.name, COUNT(r.*) AS role_count
FROM tenants t LEFT JOIN roles r USING (id, tenant_id) GROUP BY t.id;
-- Every non-super_admin user has role_id set
SELECT COUNT(*) FROM users WHERE role <> 'super_admin' AND role_id IS NULL;
-- privileges_cache contains the union of granted + inherited
SELECT name, array_length(privileges_cache, 1) FROM roles ORDER BY name;
```

---

## 6. Known follow-ups

Everything below is a deliberate scope cut from this PR — the system works end-to-end without them.

1. **RLS migration to `user_has_privilege()`.** Today, `006_rls.sql` policies still use `get_user_role() IN (...)`. Adding `user_has_privilege(auth.uid(), '...')` clauses gives RLS the new privilege check too. One per-domain migration each (prospects, appointments, documents, ...).
2. **Middleware enforcement of `login_web`.** Today, middleware uses the legacy `role` JWT claim. A Rufero with `login_web = false` still reaches the web by claim; the per-page guards catch them post-login. Adding a middleware short-circuit that fetches the role row (or stamps `login_web` into JWT `app_metadata`) would block at the edge.
3. **Custom-role assignment in the User Management dropdown.** Today the role selector is hardcoded to `admin | telefonista | rufero`. Switching it to fetch from the `roles` table (filtered by `is_assignable = true`) would let the Owner assign custom roles to users. The legacy `users.role` CHECK constraint must be dropped for this — currently it only allows the four canonical slugs.
4. **JWT privilege stamping.** Today `app_metadata.privileges` is not populated. Middleware does a DB hit on every request through `getCurrentUser` (cached per request). Stamping privileges into the JWT on login + role-edit would remove the hop. Pair with a `cache_version` bump → token refresh flow.
5. **`role_parents` UI.** The DB supports inheritance; the UI does not yet expose it. Tenants get role inheritance only by cloning at creation time.
6. **Sweep of remaining role-string checks.** Per `grep "role ===" apps/web` there are still ~20 sites comparing role strings (e.g., `nav-items.ts` roles array, `lib/email/actions.ts`, `app/(dashboard)/missing-number-banner.tsx`, the Telnyx softphone route's `ROLES_THAT_GET_SOFTPHONE` set). Replace incrementally with `hasPrivilege` once the relevant privilege has stable production behavior.
7. **Audit log on role/privilege changes.** `manage_roles` actions don't currently write to `activities`. Add `role_created`, `role_updated`, `role_privilege_granted`, `role_privilege_revoked` activity types and emit from `roles/actions.ts`.
8. **Regenerate `database.types.ts`.** Run `supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts` against the post-038 schema; then `apps/web/lib/supabase/roles-augment.ts` can shrink to just the join-summary type (`JoinedRoleSummary`) and the casts inside `withRoles` go away.

---

## 7. Backwards-compatibility notes

- The legacy `users.role text` column is **not** dropped. All historic readers (RLS via `get_user_role()`, JWT `user_metadata.role`, page guards that haven't migrated yet) keep working.
- New code reads `user.privileges` and uses `hasPrivilege` / `requirePrivilege`.
- A user whose `role_id` is `null` (super_admin, or a user from before the backfill) falls back to "owner-or-super_admin → all privileges, else → empty set" inside `user_has_privilege()` and inside `getCurrentUser`'s `isSuperRole` derivation. This preserves today's behavior exactly during the transition.

---

## 8. Glossary

- **Privilege** — a fine-grained permission slug (`edit_prospects`, `delete_documents`).
- **Role** — a named bundle of privileges, scoped per tenant, optionally inheriting from parent roles.
- **System role** — one of the four bundled roles (Owner, Admin, Telefonista, Rufero). Not deletable.
- **Super role** — a role whose `is_super_role = true`. `user_has_privilege` short-circuits to true for every check. Owner is the only super role within a tenant.
- **Owner-only privilege** — a privilege that the Roles UI refuses to grant to anything other than the Owner (`manage_roles`, `manage_billing`). Enforced both in client UI and server action.
