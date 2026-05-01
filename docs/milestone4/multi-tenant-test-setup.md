# Multi-tenant test setup

**Date:** 2026-05-01
**Purpose:** Two isolated tenants for verifying that per-tenant Telnyx routing works end-to-end. Each tenant has its own SIP Credentials Connection, dedicated phone number, and dedicated users.

## Architecture

Each tenant in the system gets its own Telnyx **Credentials Connection**. Their phone numbers attach to it. Their reps' WebRTC clients mint short-lived tokens (`/v2/telephony_credentials`) against it. Telnyx enforces tenant isolation structurally — a call to Tenant A's number cannot ring Tenant B's clients, by Telnyx design.

Schema piece that makes this work:

```sql
-- migration 015
ALTER TABLE tenants ADD COLUMN telnyx_credential_connection_id text;
```

At onboarding, the platform calls `lib/telnyx/client.createCredentialConnection()` and stores the returned id on the tenant row. Phone numbers purchased afterward get attached to that connection (`tenant_phone_numbers.voice_app_id` field, repurposed semantically).

## Provisioned tenants

### Tenant 1

| Field | Value |
|---|---|
| Tenant ID | `22222222-2222-2222-2222-222222222222` |
| Name | Tenant 1 (was: Ozark Roofing Co — renamed) |
| Slug | `ozark-roofing` |
| Telnyx Credentials Connection ID | `2950015274650175426` |
| Telnyx Connection Name | `Roof-Aid WebRTC` |
| Phone number | `+1-512-980-6131` (label: Main) |

### Tenant 2

| Field | Value |
|---|---|
| Tenant ID | `33333333-3333-3333-3333-333333333333` |
| Name | Tenant 2 |
| Slug | `tenant-2` |
| Telnyx Credentials Connection ID | `2950033435189576877` |
| Telnyx Connection Name | `Tenant 2 WebRTC` |
| Phone number | `+1-512-566-1478` (label: Main) — reassigned from Tenant 1 |

## Test login credentials

> Save these — passwords aren't recoverable later. Treat them like any test creds: don't reuse for prod.

### Tenant 1 — `+1-512-980-6131`

| Role | Email | Password |
|---|---|---|
| **Owner** | `ashenafigodanaj@gmail.com` | (your existing password — unchanged) |
| **Telefonista** | `telefonista1@roof-aid-test.com` | `RoofAid-T1-Tel-26` |

### Tenant 2 — `+1-512-566-1478`

| Role | Email | Password |
|---|---|---|
| **Owner** | `ashenafigodanak@gmail.com` | `RoofAid-T2-Owner-26` |
| **Telefonista** | `telefonista2@roof-aid-test.com` | `RoofAid-T2-Tel-26` |

## Multi-tenancy verification

To confirm the isolation works as designed, after the softphone ships:

1. Open browser A as `telefonista1@roof-aid-test.com`. Connect softphone.
2. Open browser B (incognito) as `telefonista2@roof-aid-test.com`. Connect softphone.
3. Call `+1-512-980-6131` from a real phone → only browser A rings.
4. Call `+1-512-566-1478` from a real phone → only browser B rings.
5. Telefonista 1 dials a prospect → outbound call shows `+1-512-980-6131` as caller ID.
6. Telefonista 2 dials a prospect → outbound call shows `+1-512-566-1478`.

If any call rings the wrong browser, the routing is broken. With the per-tenant Connection architecture, this can only happen if there's a code bug in `/api/telnyx/credentials` (e.g. minting against the wrong connection_id).

## Adding a new tenant in the future

This is the "no work in the future" promise. The wizard runs:

1. Insert `tenants` row
2. `await createCredentialConnection({ connectionName: \`${tenant.slug} WebRTC\`, ... })` → save id
3. Tenant signs up an owner via Supabase auth → public.users row created
4. Tenant clicks **Buy & continue** in onboarding step 2 → `purchaseAndAttachNumber` runs, which is being updated to attach numbers to **the caller's tenant connection** instead of the platform-wide voice app

Once Step 4 below ships, no manual DB writes or portal clicks are needed for new tenants.

## Open work to fully realize the architecture

These were intentionally deferred from this provisioning batch — they apply at next code change:

- **Update `purchaseAndAttachNumber`** in `app/onboarding/actions.ts` to read `tenants.telnyx_credential_connection_id` and pass that to `purchaseNumber`'s `connection_id` (instead of the platform-wide `TELNYX_VOICE_APP_ID` env var)
- **Update `addPhoneNumber`** in `app/(dashboard)/admin/settings/phone-numbers/actions.ts` for the same reason
- **Build `/api/telnyx/credentials`** route — the WebRTC SDK's auth path; mints a token against the caller's tenant connection
- **Build `<Softphone />`** with the tenant-aware credentials route
- **Provisioning at signup** — when a new tenant is created (auth flow we don't have a UI for yet, only the seed script), call `createCredentialConnection` and store the result. Until that's wired, new tenants have to be provisioned manually like Tenant 2 was.

## Files added in this batch

- `supabase/migrations/015_tenant_telnyx_connection.sql`
- `apps/web/lib/telnyx/client.ts` — `createCredentialConnection`, `deleteCredentialConnection`, `setNumberConnection` exports
- This doc

## References

- [stage-2-web-softphone.md](stage-2-web-softphone.md) — original spec, single-tenant assumption (now superseded for the connection model)
- [stage-1.5-tenant-phone-numbers.md](stage-1.5-tenant-phone-numbers.md) — per-tenant numbers schema
- [number-provisioning-implementation.md](number-provisioning-implementation.md)
