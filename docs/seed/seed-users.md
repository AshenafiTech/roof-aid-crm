# Seed Users

## Purpose

Wire `auth.users` accounts into `public.users` and JWT metadata so the
web dashboard can resolve a profile after login and RLS helper functions
(`public.get_tenant_id()`, `public.get_user_role()`) read the correct
claims from the JWT.

This doc captures the **current dev/test state** of accounts on the
linked Supabase project (`ivmfmpscdimyepbvrbee`). It covers two
populations:

1. The original two owners seeded via `supabase/migrations/1000_seed_users.sql`.
2. The multi-tenant test accounts (Tenant 2 owner + per-tenant
   telefonistas) created via the Supabase Auth Admin API on 2026-05-01
   while standing up the per-tenant Telnyx connection architecture
   (see [milestone4/multi-tenant-test-setup.md](../milestone4/multi-tenant-test-setup.md)).

## Migration (covers original two only)

`supabase/migrations/1000_seed_users.sql`

For each email it touches:

1. Looks up the matching `auth.users.id`. Raises an exception if the
   row doesn't exist — create it first via the Supabase dashboard
   (Authentication → Users → Add user, with email confirmed).
2. Merges `tenant_id` and `role` into `auth.users.raw_user_meta_data` so
   the values land in the JWT next sign-in. Without this, every
   RLS-protected query returns 0 rows even for a logged-in user.
3. Upserts a row in `public.users` with the same `id`, bound to the
   target tenant with role `owner`.

## Tenants

| Tenant | Tenant ID | Phone number | Telnyx Connection |
|---|---|---|---|
| **Tenant 1** (was Ozark Roofing Co) | `22222222-2222-2222-2222-222222222222` | `+1-512-980-6131` | `2950015274650175426` |
| **Tenant 2** | `33333333-3333-3333-3333-333333333333` | `+1-512-566-1478` | `2950033435189576877` |
| NWA Roofing Co | `11111111-1111-1111-1111-111111111111` | (provisioned since) | `2951667469221103022` |
| **Tenant 3** | `eb44d9e4-e5cd-4318-81cd-f178402cc391` | (none) | (none) |
| **Test Roofing** *(no-phone test bed)* | `7ab88bbb-cf23-4b80-bfdd-5368869e1e0d` | (none) | (none) |

> NWA Roofing Co was originally the no-phone tenant; a Telnyx connection
> was attached to it on 2026-05-12 during the Test Roofing setup. Use
> **Test Roofing** or **Tenant 3** for "tenant has no calling configured"
> test cases going forward.

## User / tenant / login mapping

> ⚠️ **Dev / test passwords only.** Treat as throwaway. Rotate before
> any shared/staging/prod use (Supabase Dashboard → Authentication →
> Users → row → Send password recovery, or use the Admin API).

### Tenant 1 — `+1-512-980-6131`

| Role | Email | Password | Source | Auth UID |
|---|---|---|---|---|
| `owner` | `ashenafigodanaj@gmail.com` | *(unchanged from your existing personal account; renamed from `jethior1@gmail.com` in auth)* | Migration `1000_seed_users.sql` | `a1541b5c-43a9-4d7c-9f70-86d5a364c612` |
| `telefonista` | `telefonista1@roof-aid-test.com` | `RoofAid-T1-Tel-26` | Admin API, 2026-05-01 | `cc20dd98-cec0-471a-afaa-fd0ed57ba52b` |

### Tenant 2 — `+1-512-566-1478`

| Role | Email | Password | Source | Auth UID |
|---|---|---|---|---|
| `owner` | `ashenafigodanak@gmail.com` | `RoofAid-T2-Owner-26` | Admin API, 2026-05-01 | `104eec45-9c4d-4ef7-abcc-f7eaf1e41cdc` |
| `telefonista` | `telefonista2@roof-aid-test.com` | `RoofAid-T2-Tel-26` | Admin API, 2026-05-01 | `9c420673-e1fa-46fe-9346-05a67de1bcfd` |

### NWA Roofing Co (legacy seed)

Once the no-phone tenant; now has a Telnyx connection attached (see
Tenants table). Don't use this account for "tenant has no calling" tests.

| Role | Email | Password | Source | Auth UID |
|---|---|---|---|---|
| `owner` | `jirudagutema@gmail.com` | `Demo1234!` | Migration `1000_seed_users.sql` | `45310d29-732c-4e40-a4a8-2866053ea60e` |

### Test Roofing — no-phone test bed

Tenant has `telnyx_credential_connection_id = NULL` and no
`tenant_phone_numbers` rows. Use this account to exercise the
MissingNumberBanner, softphone "tenant has no calling configured"
error path, and disabled Call/SMS buttons.

| Role | Email | Password | Source | Auth UID |
|---|---|---|---|---|
| `owner` | `test@roof-aid-test.com` | `Test1234!` | SQL recipe, 2026-05-12 | *(generated; query auth.users by email)* |

## Status

- Original two owners (`jirudagutema@`, `ashenafigodanaj@`) were created
  via the Supabase Dashboard with `email_confirm: true`. The migration
  upserts the matching `public.users` rows and merges JWT metadata. Safe
  to re-run.
- The Tenant 2 owner and the two telefonistas were provisioned on
  2026-05-01 via the Auth Admin API (`POST /auth/v1/admin/users`) plus
  a corresponding `public.users` insert. They are **not** in any
  migration file — recorded here as the source of truth.

## Apply (original two)

```bash
# Remote (linked) project
npx supabase db push --linked

# Or paste 1000_seed_users.sql in Supabase Studio → SQL Editor
```

## After applying

All users must **sign out and sign back in** once — JWTs issued before
the metadata update don't carry `tenant_id` / `role`. After re-login
the dashboard shows tenant-scoped data.

## Verification

```sql
-- Expect 5 rows: 2 owners + 2 telefonistas + NWA legacy owner
select u.email, u.role, t.name
from public.users u
join public.tenants t on t.id = u.tenant_id
where u.email in (
  'jirudagutema@gmail.com',
  'ashenafigodanaj@gmail.com',
  'ashenafigodanak@gmail.com',
  'telefonista1@roof-aid-test.com',
  'telefonista2@roof-aid-test.com'
)
order by t.name, u.role;

-- Expect tenant_id + role present in JWT metadata for each
select email, raw_user_meta_data
from auth.users
where email in (
  'ashenafigodanaj@gmail.com',
  'ashenafigodanak@gmail.com',
  'telefonista1@roof-aid-test.com',
  'telefonista2@roof-aid-test.com'
);
```

## Re-running

The migration is safe to re-run — uses `ON CONFLICT (id) DO UPDATE` and
merges JSONB. The Admin-API-provisioned accounts are not idempotent
through the migration; if they're deleted, recreate via the curl
recipe in
[milestone4/multi-tenant-test-setup.md](../milestone4/multi-tenant-test-setup.md).

## Notes / decisions

- Tenant 1 owner email was renamed from `jethior1@gmail.com` to
  `ashenafigodanaj@gmail.com` on 2026-04-30 by editing
  `auth.users.email` directly. The auth_id and password stayed the
  same.
- Original migration was edited to use the new email so a future
  `db push` against a fresh DB still works.
- The two telefonista emails (`telefonista1@roof-aid-test.com`,
  `telefonista2@roof-aid-test.com`) are non-deliverable test addresses.
  Supabase accepts them with `email_confirm: true` and they're never
  used for password recovery — if you need to reset, change via Admin
  API directly.
- These accounts are intentionally **not** in
  `1000_seed_users.sql` because that migration is for owner accounts
  that match real Gmail addresses; mixing test telefonistas in there
  would force fresh-DB setups to create dummy auth rows.
