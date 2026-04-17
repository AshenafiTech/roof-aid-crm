# User Management

## Purpose
Implement full user management for tenant owners — invite team members, assign roles, edit profiles, deactivate/reactivate accounts, force password resets, and delete users. Only owners (and super_admins) have access to this feature.

## Roles

| Role | Access Level |
|------|-------------|
| **Owner** | Full access including billing and user management. Cannot be deactivated or deleted by others. |
| **Admin** | Office manager — full prospect access, user list visible, no billing. |
| **Telefonista** | Call agent — search, contact, schedule prospects. Can edit/transition prospects. |
| **Rufero** | Field inspector — sees only assigned prospects. Mobile-first. |
| **Super Admin** | Platform-level. Invisible to regular tenants. |

## Features

### User List (Single Table Layout)
- Compact toolbar: inline stat chips (Total, Active, Inactive), search input, role filter dropdown, Invite button
- Single grid-based table with columns: User (initials + name + email), Role (badge with colored dot), Phone, Joined, Actions
- Action dropdown per user: Edit, Reset Password, Deactivate/Reactivate, Delete
- Role legend at the bottom with descriptions for each role
- Responsive design — hides optional columns on smaller screens

### Invite User Dialog
- Fields: First name, Last name, Email, Role (visual card selector), Phone, Telnyx Extension
- Role selector shows 3 cards (Admin, Telefonista, Rufero) with descriptions
- Creates Supabase Auth account via admin API with temporary password
- Inserts row in `public.users` with correct `tenant_id`
- Shows credentials dialog after creation with copy-to-clipboard

### Edit User Dialog
- Editable fields: First name, Last name, Role (except for owners), Phone, Telnyx Extension, SendGrid Sender
- Email is read-only (shown but not editable)
- Role change also updates `auth.users.raw_user_meta_data` via admin API
- Owners cannot have their role changed

### Deactivate / Reactivate
- Sets `is_active = false` on the users table
- Bans/unbans the auth account via `admin.auth.admin.updateUserById`
- Banned users cannot sign in
- Confirmation dialog required
- Cannot deactivate yourself or other owners

### Delete User
- Permanently removes from `public.users` and `auth.users`
- Destructive action with confirmation dialog
- Cannot delete yourself or owners

### Password Reset
- Generates a recovery link via `admin.auth.admin.generateLink`
- Confirmation dialog before sending
- Works for any user in the tenant

## Access Control
- Page-level: `getCurrentUser()` checks role; redirects non-owners to `/`
- Action-level: Every server action calls `requireOwner()` which verifies `role === 'owner' || 'super_admin'`
- RLS policies enforce tenant isolation — users can only see/modify their own tenant's users

## Architecture

### Admin Client (`lib/supabase/admin.ts`)
- Uses `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client)
- Bypasses RLS for admin operations (auth user creation, banning, deletion)
- Standard client still used for tenant-scoped queries (respects RLS)

### Server Actions (`admin/users/actions.ts`)
- `listTenantUsers()` — fetches all users in the current tenant
- `inviteUser()` — creates auth + public user, returns temp password
- `editUser()` — updates profile + JWT metadata
- `toggleUserActive()` — activates/deactivates + bans/unbans auth
- `resetUserPassword()` — generates recovery link
- `deleteUser()` — removes from both tables

### Client Component (`admin/users/user-management.tsx`)
- Clean single-table layout with compact toolbar (stat chips, search, role filter, invite)
- Grid-based user rows with initials avatar, role badges with colored dots, action dropdowns
- Optimistic UI: updates local state immediately after server action success
- All dialogs: Invite (role card selector with checkmark), Edit (identity header card), Confirm (centered icon layout), Credentials (centered success with divided sections)
- Client-side search filtering by name/email and role filter dropdown

## Files Created
- `apps/web/lib/supabase/admin.ts` — Service role Supabase client
- `apps/web/app/(dashboard)/admin/users/actions.ts` — Server actions for user CRUD
- `apps/web/app/(dashboard)/admin/users/user-management.tsx` — Client-side UI components

## Files Modified
- `apps/web/app/(dashboard)/admin/users/page.tsx` — Replaced stub with full page
- `apps/web/lib/auth/permissions.ts` — Added `canManageUsers()` helper
