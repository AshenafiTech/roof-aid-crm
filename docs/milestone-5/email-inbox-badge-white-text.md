# Email Inbox Unread Badge — White Text

## Purpose
Improve readability of the unread-count badge on the Inbox tab in the email notification section by forcing the badge text to white.

## Change
- File: `apps/web/app/(dashboard)/email/email-workspace.tsx`
- Added `text-white` to the unread-count `<Badge variant="destructive">` on the Inbox tab.

## Notes
The destructive badge variant uses a red background; explicit `text-white` guarantees consistent white text regardless of theme tweaks.
