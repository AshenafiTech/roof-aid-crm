# Signup Wizard — Fix "Cannot read properties of undefined (reading 'rest')"

## Purpose

The signup wizard crashed on step 2 (Agreements) with the runtime error
`Cannot read properties of undefined (reading 'rest')`. This document
captures the root cause and the fix.

## Symptom

On clicking **Continue** at step 2, the wizard rendered the error banner:

> Cannot read properties of undefined (reading 'rest')

The flow never reached step 3 and no tenant/user was created.

## Root cause

In `apps/web/app/(auth)/signup/actions.ts`, the call to the
`seed_default_roles` RPC captured `admin.rpc` into a local variable in
order to bypass the strict typed-function signature on the
`SupabaseClient`:

```ts
const adminRpc = admin.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: { message: string } | null }>;
const { error: rolesSeedErr } = await adminRpc("seed_default_roles", {
  p_tenant_id: tenant.id,
});
```

Assigning the method to a local variable detaches it from its receiver.
When `adminRpc(...)` is then invoked, `this` inside `SupabaseClient.rpc`
is `undefined`. The first thing that implementation does is access
`this.rest`, which throws the observed `TypeError`.

The `createAccount` server action's `try/catch` surfaced the message
verbatim to the wizard, which displayed it in the step 2 error banner.

## Fix

Call `rpc` directly on the `admin` client so the `this` binding is
preserved, and use `as never` casts to satisfy the typed signature for
a function (`seed_default_roles`) that isn't yet in
`database.types.ts`:

```ts
const { error: rolesSeedErr } = await admin.rpc(
  "seed_default_roles" as never,
  { p_tenant_id: tenant.id } as never,
);
```

## Notes

- Same pattern is used elsewhere in this file (e.g. the `roles` table
  read), and is the safe way to call an RPC that hasn't been added to
  the generated `Database` types.
- If you need to forward a method reference in the future, bind it
  explicitly: `const fn = admin.rpc.bind(admin)`.
