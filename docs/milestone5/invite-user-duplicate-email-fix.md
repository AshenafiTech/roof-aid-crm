# Fix — `inviteUser` 500 on Duplicate Email

## Purpose
Vercel runtime logs showed `POST 500 /admin/users — Error: A user with
this email already exists` every time an owner tried to invite a user
whose email was already in the `users` table. The action was throwing
instead of returning a handled error, which:

1. Polluted Vercel logs with red `level:error` rows for an expected /
   validatable user mistake.
2. Could surface as Next.js's generic "This page couldn't load — server
   error" page in certain re-render paths instead of a clean toast.

## Change
- [apps/web/app/(dashboard)/admin/users/actions.ts](../../apps/web/app/(dashboard)/admin/users/actions.ts):
  refactored `inviteUser` to return a discriminated union
  `{ ok: true; id; tempPassword } | { ok: false; error }` — same shape the
  signup flow uses for `createAccount` in
  [apps/web/app/(auth)/signup/actions.ts](../../apps/web/app/(auth)/signup/actions.ts).
  All in-action error paths (duplicate email, Supabase auth create
  failure, users-table insert failure) now `return { ok: false, error }`
  rather than `throw`.
- [apps/web/app/(dashboard)/admin/users/user-management.tsx](../../apps/web/app/(dashboard)/admin/users/user-management.tsx):
  invite dialog now checks `result.ok` first and shows a `toast.error`
  with `result.error` when the action returns a handled failure. The
  outer `try/catch` is retained for genuinely unexpected throws (network,
  schema validation, etc.).

## Notes
- The Zod `.parse()` call still throws on invalid input — that's
  appropriate (it indicates a client/server contract violation, not a
  user mistake).
- Vercel's 500 logs for `/admin/users` should stop appearing for the
  duplicate-email case after the next deploy.
- If the user-facing "page couldn't load" screen continues showing on a
  different route, the next step is to filter Vercel logs by route to
  isolate which other action is throwing unhandled.
