# Fix: Signup crashes with "Cannot read properties of undefined (reading 'rest')"

## Purpose

Resolve a runtime `TypeError` thrown during account creation in the signup
wizard (step 2), preventing any new tenant from being provisioned.

## Symptom

Submitting the signup form produced a Next.js server error:

```
Runtime TypeError: Cannot read properties of undefined (reading 'rest')
  at createAccount (app/(auth)/signup/actions.ts:195:41)
```

The crash happened on the call to `seed_default_roles` RPC, immediately after
the tenant row was inserted — leaving an orphan tenant with no Owner role and
no auth user.

## Root cause

`apps/web/app/(auth)/signup/actions.ts` extracted Supabase's `rpc` method into
a local variable in order to call an RPC that isn't yet present in
`database.types.ts`:

```ts
const adminRpc = admin.rpc as unknown as (...) => ...;
await adminRpc("seed_default_roles", { p_tenant_id: tenant.id });
```

Detaching the method from its receiver loses the `this` binding. Internally
Supabase's `rpc` reads `this.rest` to construct the request, so the invocation
threw `Cannot read properties of undefined (reading 'rest')`.

## Fix

Bind the method to the `admin` client before casting:

```ts
const adminRpc = admin.rpc.bind(admin) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: { message: string } | null }>;
```

This preserves `this`, so the underlying PostgREST client can be reached and
the RPC executes normally.

## Notes

- No schema or migration change was required — the `seed_default_roles`
  function from migration 038 was already correct.
- When `seed_default_roles` is added to the generated `database.types.ts`,
  the entire type-erased indirection can be removed and the call can be made
  directly as `admin.rpc("seed_default_roles", { p_tenant_id: tenant.id })`.

## Files touched

- `apps/web/app/(auth)/signup/actions.ts` (line 195 area)
