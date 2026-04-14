# Seed Users

## Purpose

Link two existing `auth.users` accounts to the `public.users` table (one per seeded tenant) so that the web dashboard layout can resolve a profile after login, and so that RLS helper functions (`public.get_tenant_id()`, `public.get_user_role()`) read the correct claims from the JWT.

## Migration

`supabase/migrations/1000_seed_users.sql`

## What it does

For each email below:

1. Looks up the matching `auth.users.id`. Raises an exception if the row does not exist (pre-req: create the account first via the Supabase dashboard, Authentication → Users → Add user, with email confirmed).
2. Merges `tenant_id` and `role` into `auth.users.raw_user_meta_data` so these values land in the JWT the next time the user signs in. Without this, every RLS-protected query returns 0 rows even for a logged-in user.
3. Upserts a row in `public.users` with the same `id`, bound to the target tenant with role `owner`.

## User / tenant mapping

| Email | Tenant | Tenant ID | Role | Auth UID | Dev password |
|-------|--------|-----------|------|----------|--------------|
| `jirudagutema@gmail.com` | NWA Roofing Co | `11111111-1111-1111-1111-111111111111` | `owner` | `45310d29-732c-4e40-a4a8-2866053ea60e` | `Demo1234!` |
| `jethior1@gmail.com` | Ozark Roofing Co | `22222222-2222-2222-2222-222222222222` | `owner` | `a1541b5c-43a9-4d7c-9f70-86d5a364c612` | `Demo1234!` |

> Passwords are dev-only. Rotate before any shared/production use (Supabase Dashboard → Authentication → Users → row → Send password recovery, or use the Admin API).

## Status

Both accounts were created directly against the remote project `ivmfmpscdimyepbvrbee` via the Auth Admin API on 2026-04-14, with `email_confirm: true` and `user_metadata` containing `tenant_id` + `role`. The `public.users` rows were upserted immediately after. The SQL migration below is retained so the same state can be reproduced on another environment.

## Apply

```bash
# Remote (linked) project
npx supabase db push

# Or run the file directly in Supabase Studio → SQL Editor
```

## After applying

Both users must **sign out and sign back in** once — JWTs issued before the metadata update do not carry `tenant_id` / `role`. After re-login the dashboard will show tenant-scoped data.

## Verification

```sql
-- Expect 2 rows
select u.email, u.role, t.name
from public.users u
join public.tenants t on t.id = u.tenant_id
where u.email in ('jirudagutema@gmail.com', 'jethior1@gmail.com');

-- Expect tenant_id + role present in metadata
select email, raw_user_meta_data
from auth.users
where email in ('jirudagutema@gmail.com', 'jethior1@gmail.com');
```

## Re-running

Safe to re-run. The migration uses `ON CONFLICT (id) DO UPDATE` for `public.users` and merges JSONB for `auth.users.raw_user_meta_data`.

## Notes / decisions

- Both users are assigned role `owner`. If admin / telefonista / rufero test accounts are needed later, extend the migration or add a separate seed — those roles will need matching `auth.users` entries first.
- First / last name values (`Jiru Gutema`, `Jethior Demo`) are placeholders; update `public.users` directly if you want different display names.
