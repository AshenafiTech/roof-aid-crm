# Fix: Telnyx connection-create 422 — "Must contain only letters and numbers; no spacing allowed"

## Purpose

Tenants could not purchase their first phone number. The first-purchase
flow lazily creates a Telnyx Credentials Connection via
`ensureTenantTelnyxConnection`, and Telnyx rejected our request with:

> Telnyx 422: Bad Request — Must contain only letters and numbers; no spacing allowed

## Root cause

Telnyx requires both `user_name` and `connection_name` on
`POST /credential_connections` to be **alphanumeric only** — no hyphens,
underscores, or spaces. Our payload violated this on two fields:

| Field             | Old value                                | Problem        |
| ----------------- | ---------------------------------------- | -------------- |
| `connection_name` | `"${tenantSlug} WebRTC"`                 | contains space |
| `user_name`       | `"roofaid-${tenantSlug}-${nonce}"`       | contains `-`   |

`tenantSlug` itself can also contain hyphens (e.g. `acme-roofing`),
which would fail validation even after removing the literal space and
prefix dashes.

## Fix

`apps/web/lib/telnyx/ensure-tenant-connection.ts`:

- Strip the slug to alphanumeric before composing either field.
- Drop the dashes from `user_name`.
- Drop the space from `connection_name`.

```ts
const slugAlnum = opts.tenantSlug.replace(/[^a-zA-Z0-9]/g, "");
const userName = `roofaid${slugAlnum}${nonce}`.slice(0, 32);
// connectionName: `${slugAlnum}WebRTC`
```

`user_name` uniqueness is still guaranteed by the 6-hex-char `nonce`.
`password` was already alphanumeric — unchanged.

## Notes

- No migration needed. Existing tenants with a stamped
  `telnyx_credential_connection_id` short-circuit before the create call.
- Connections that were partially created on prior failed attempts (if
  any) are free to leave; Telnyx connection-create has no cost. They
  can be GC'd later via the Telnyx portal.
