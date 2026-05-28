# User invite credentials — viewable, resettable, better copy UX

## Purpose
Owner asked for three improvements to the user-management flow:
1. Improve the copy UX for the temp password shown after invite.
2. Be able to view the credentials again later.
3. Be able to change a user's credentials.

Auth passwords are stored as bcrypt hashes — the plaintext literally cannot be retrieved after the fact. So "view later" is implemented as **generate a new temp password and show it once** (semantically equivalent for the admin's use case: hand the user something they can sign in with). The same flow satisfies "change credentials."

## Files

### Server
- [apps/web/app/(dashboard)/admin/users/actions.ts](apps/web/app/(dashboard)/admin/users/actions.ts) — `resetUserPassword` rewritten:
  - **Before**: called `admin.auth.admin.generateLink({ type: 'recovery' })`, which only mails a recovery link via Supabase SMTP. The admin never saw the link, the user might not receive the email, and there was no in-app credentials view.
  - **After**: generates a fresh `crypto.randomUUID().slice(0,16) + 'Aa1!'` style temp password and calls `admin.auth.admin.updateUserById(userId, { password })`. Returns `{ email, tempPassword }` so the UI can show it once. Previous password stops working immediately. Owner-can't-reset-another-owner guard preserved.
  - Same generation scheme as the original invite, so the format/strength is consistent.

### Confirm dialog wiring
- [apps/web/app/(dashboard)/admin/users/user-management.tsx](apps/web/app/(dashboard)/admin/users/user-management.tsx):
  - `ConfirmActionDialog.onSuccess` signature extended with an optional `resetCreds` second arg. The `reset` branch now awaits the new server action result, pushes `creds` through `onSuccess(undefined, creds)`, and the parent forwards them to the existing `CredentialsDialog` state — re-using the same dialog used after invite.
  - Reset confirm copy updated: "A new temporary password will be generated for {email}. Their previous password will stop working immediately — share the new one with them securely." Button label: **"Generate New Password"**.

### CredentialsDialog UX
- Same dialog now serves both invite and reset flows.
- **Per-field copy** with check-mark feedback (1.5s) and ARIA labels.
- **Show / hide password** toggle (eye / eye-off icon) — password is masked by default with `•` characters.
- "Copy both" button concatenates `Email: …\nTemporary password: …` (preserved from before).
- Help copy explains the one-time-show + "you can generate a new one anytime from the user's row" so admins know how to recover.
- Dark-mode friendly: green success badge uses `dark:bg-green-500/15`, copy success uses `text-emerald-600 dark:text-emerald-400`.

## How "view credentials later" works
There's no stored plaintext to view, so the admin clicks **⋯ → Reset Password** on a user row. That generates a brand new temp password, opens the same credentials dialog they saw at invite time, and the admin can copy/share again. The old password is invalidated server-side at the same moment.

## Out of scope
- A "set custom password" form (admin types the password). Could be added later; today the generated random pattern is consistent and avoids weak passwords.
- Magic-link or email delivery of the credentials — Supabase SMTP can be configured separately if email delivery is wanted in addition to in-app display.
