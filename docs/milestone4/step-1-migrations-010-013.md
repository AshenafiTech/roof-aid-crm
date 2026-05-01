# Step 1 — Migrations 010–013

**Date:** 2026-04-29
**Stage:** M4 Stage 1 (Communications Foundation) + Stage 1.5 (Per-tenant numbers)
**Files added:**
- `supabase/migrations/010_comms_schema_extensions.sql`
- `supabase/migrations/011_can_call_rpc.sql`
- `supabase/migrations/012_storage_call_recordings.sql`
- `supabase/migrations/013_tenant_phone_numbers.sql`

## Purpose

Lay the database foundation for every M4 communications feature in a
single PR-sized batch. Nothing in M4 (softphone, SMS, email, DNC, number
provisioning) builds correctly without these tables, columns, and RPCs.

## What each migration does

### 010 — `comms_schema_extensions.sql`

Adds tenant-level config + idempotency + webhook audit:

- `tenants.timezone` (default `America/Chicago`)
- `tenants.calling_hours` (jsonb, mon–sun, default 8a–8p weekdays)
- `tenants.sms_templates` / `email_templates` (jsonb arrays, empty default)
- `tenants.recording_disclosure_audio_url` (nullable)
- `users.telnyx_extension` UNIQUE constraint (column already existed in 002)
- `call_logs.provider_event_id`, `sms_logs.provider_message_id`,
  `email_logs.provider_message_id` — partial-unique indexes (idempotency keys)
- `webhook_events` table — immutable audit log for every Telnyx/SendGrid
  event we receive, with `signature_ok`, `processed_at`, `process_error`.
  RLS-locked to `super_admin` for SELECT; service-role bypasses for INSERT.

### 011 — `can_call_rpc.sql`

Two `SECURITY DEFINER` functions:

- `can_call(p_prospect_id uuid)` — returns `{allowed, reason}`. Reasons:
  `ok | not_found | cross_tenant | dnc | no_phone | outside_calling_hours`.
  Calling-hours check uses `tenants.timezone` + `tenants.calling_hours`.
- `can_message(p_prospect_id uuid)` — same shape, no calling-hours check
  (TCPA SMS quiet-hours rules are applied at the API boundary in Stage 3).

Both are granted to `authenticated`. Used by every web/mobile dial+send
site as the **single source of truth** for "may we contact this prospect now?"

### 012 — `storage_call_recordings.sql`

- Creates private bucket `call-recordings`
- Four RLS policies (SELECT/INSERT/UPDATE/DELETE) scoped to
  `{tenant_id}/...` path prefix via `storage.foldername(name)[1]`
- Mirrors the existing pattern used for inspection-photos

### 013 — `tenant_phone_numbers.sql`

The per-tenant DID table that powers Stage 1.5:

- `tenant_phone_numbers` with `e164` UNIQUE, `telnyx_number_id` UNIQUE,
  capabilities array, attached `messaging_profile_id` / `voice_app_id`,
  `label`, `is_primary`, `routing_rule` jsonb, `status` lifecycle
- Partial unique index — at most one primary per tenant (active rows)
- Index on `e164 WHERE status='active'` — webhook's `tenantFromTo()` lookup
- RLS: tenant-scoped SELECT for any authenticated user; INSERT/UPDATE
  restricted to `owner | admin | super_admin`
- DELETE intentionally forbidden — `status='released'` is the soft-delete
  path so log entries that reference the number stay valid
- `call_logs.tenant_phone_number_id` + `sms_logs.tenant_phone_number_id`
  FKs added — powers per-number usage rollups and marketing attribution

## Decisions made during implementation

- **Used `IF NOT EXISTS` everywhere** so the migrations are idempotent.
  Re-running them on a partially-applied DB is safe.
- **Unique constraint on `users.telnyx_extension`** added via
  `DO $$ ... pg_constraint check ... $$` block to handle the
  already-exists case gracefully (column came from 002 without UNIQUE).
- **Partial unique indexes for idempotency columns** — allows multiple
  NULL `provider_event_id` rows during transition, while still enforcing
  uniqueness once webhook handlers populate them.
- **RLS on `webhook_events`** — locked to `super_admin` SELECT only.
  Webhook bodies can contain phone numbers + message text and shouldn't
  be readable by ordinary tenant users.
- **`tenant_phone_numbers` does NOT include a `connection_id` column** —
  the spec uses `voice_app_id` (which IS the Telnyx connection ID
  underneath, since Call Control Apps wrap a connection sharing the
  same numeric ID). One field, less duplication.

## What's intentionally NOT in this batch

- **`dnc_records` table** — referenced in M4 README's prereqs as
  "verified present from M1 schema" but actually missing. Belongs in
  Stage 5 (DNC enforcement), not here. Filed as a TODO for stage-5 doc.
- **Vault secrets insertion** — done via `SELECT vault.create_secret(...)`
  manually, not via migration. Per stage-1 doc, this is a one-time
  Supabase Dashboard operation:
  ```sql
  SELECT vault.create_secret('TELNYX_PUBLIC_KEY',   '<value>');
  SELECT vault.create_secret('TELNYX_API_KEY',      '<value>');
  SELECT vault.create_secret('SENDGRID_PUBLIC_KEY', '<value>');
  SELECT vault.create_secret('SENDGRID_API_KEY',    '<value>');
  ```

## How to apply

```bash
# Verify migrations look right (dry-run / list)
supabase migration list --linked

# Apply to remote (will run 010, 011, 012, 013 in order)
supabase db push --linked

# OR apply to local dev DB only
supabase db reset            # wipes + re-applies everything
# - or -
supabase migration up        # applies pending only
```

## Actually applied (2026-04-29)

Push completed against remote project `ivmfmpscdimyepbvrbee`. After
applying, `supabase migration list --linked` reported 010-013 present
in both Local and Remote columns:

```
Local | Remote
010   | 010
011   | 011
012   | 012
013   | 013
```

### Setup snags resolved during the push

- **Stale project ref.** `supabase/.temp/project-ref` and the root
  `.env.local` `connection_string` both pointed to a dead/old project
  (`acdexwubxekqqyldcwng`). The actual active project ref —
  `ivmfmpscdimyepbvrbee` — comes from `apps/web/.env.local`'s
  `NEXT_PUBLIC_SUPABASE_URL`. Fixed both the CLI cache and any docs that
  referenced the wrong subdomain (which means **the Telnyx webhook URLs
  in the portal also needed updating** — the user did this).
- **CLI version mismatch.** System `supabase` CLI was v1.200.3 — too
  old to read this project's `config.toml` (rejects `db.major_version: 17`
  and unknown `db.migrations.*` fields). Installed v2.95.4 to
  `~/bin/supabase-new` for the push.
- **Pre-existing migrations 007–009 were on the remote but untracked.**
  Running them again hit `policy "notes_update" already exists`. Fixed
  by `supabase migration repair --linked --status applied 007 008 009`
  to mark them as already-applied without re-running.
- **Seed files 1000 and 999 still pending.** `1000_seed_users.sql`
  fails because it references `auth.users` rows (`jirudagutema@gmail.com`,
  `jethior1@gmail.com`) that don't exist on this DB. Pre-existing
  project-setup concern — out of scope for this PR. They stay in the
  pending state until those auth users are created in the dashboard.

## Verification (Stage 1 §5 done-when checks)

After applying, run these against the remote DB to confirm:

```sql
-- 010: schema extensions present
\d tenants
-- expect: timezone, calling_hours, sms_templates, email_templates,
--         recording_disclosure_audio_url

-- 010: webhook_events exists
\d webhook_events

-- 011: RPCs work
SELECT can_call('<seeded prospect uuid>');
-- during business hours: {"allowed": true, "reason": "ok"}
-- after 8pm:             {"allowed": false, "reason": "outside_calling_hours"}

-- Toggle DNC and re-test
UPDATE prospects SET do_not_call = true WHERE id = '<uuid>';
SELECT can_call('<uuid>');
-- expect: {"allowed": false, "reason": "dnc"}

-- 012: bucket exists
SELECT id, public FROM storage.buckets WHERE id = 'call-recordings';

-- 013: per-tenant number table works
\d tenant_phone_numbers
SELECT * FROM tenant_phone_numbers;   -- empty, that's expected
```

## Next step

Step 2 — `telnyx-webhook` Edge Function skeleton. Verifies signatures,
logs to `webhook_events`, returns 200. Required before any tenant
provisions a number, since purchased numbers immediately start
receiving inbound events.

## References

- [stage-1-comms-foundation.md](stage-1-comms-foundation.md) — full Stage 1 spec
- [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md) — per-tenant numbers schema design
- [number-provisioning-implementation.md](number-provisioning-implementation.md) — overall implementation order
