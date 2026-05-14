# Email History & Viewer (Per-User Gmail)

## Purpose

Extend the Quick Email feature so that each telefonista (and owner) can:

1. Connect their **own** Gmail account independently (already in place — confirmed).
2. **Read** their Gmail inbox and sent folder from inside the CRM.
3. See **paginated** message lists with a single-message viewer.
4. See a **count of unread emails** as a badge on the sidebar nav.

Each user's Gmail OAuth tokens are stored separately in `user_google_tokens` (PK = `user_id`). No token sharing across users.

## What changed

### 1. OAuth scopes — `gmail.readonly` added

`apps/web/lib/google/config.ts`

```ts
export const GOOGLE_OAUTH_SCOPES = [
  USERINFO_EMAIL_SCOPE,
  GMAIL_SEND_SCOPE,
  GMAIL_READONLY_SCOPE, // NEW
];
```

The OAuth callback (`apps/web/app/api/google/oauth/callback/route.ts`) now rejects the connection if `gmail.readonly` is not granted (error code `missing_readonly_scope`).

**Migration impact:** users who connected Gmail before this change will need to **reconnect** to grant the new read scope. The `Disconnect → Connect` flow handles this; the disconnect button removes the row from `user_google_tokens`, then OAuth start re-prompts with `prompt=consent` (already in place).

### 2. New Gmail server helpers — `apps/web/lib/email/gmail.ts`

| Function | Purpose |
| --- | --- |
| `listGmailMessages({ userId, labelId, pageToken, pageSize })` | Page-by-page list of inbox or sent messages. Fetches metadata headers (From, To, Subject, Date) for each message id in parallel. |
| `getGmailMessage(userId, messageId)` | Full message body (plain text + HTML). |
| `getGmailUnreadCount(userId)` | Returns `messagesUnread` from Gmail's INBOX label endpoint. |
| `markGmailRead(userId, messageId)` | Removes `UNREAD` label when a user opens a message. |

Implementation notes:
- All helpers go through `gmailFetch()` which auto-refreshes the access token and clears the stored token on `401` so users can reconnect.
- Body parsing walks multipart payloads, prefers `text/plain`, falls back to stripped HTML.
- HTML bodies are rendered in a sandboxed `<iframe srcDoc>` to neutralize scripts.

### 3. New server actions — `apps/web/lib/email/actions.ts`

```ts
listEmailsAction({ folder: "INBOX" | "SENT", pageToken })
getEmailAction({ messageId, markRead })
getUnreadEmailCount() // returns 0 if not connected — never throws
```

Page size: **20 messages** per page (`EMAIL_PAGE_SIZE`), matching the existing comms pagination convention. (The 60-record SRS rule applies to prospect lists; Gmail's API rewards smaller page sizes since each row requires a metadata GET.)

### 4. UI — tabs on `/email`

`apps/web/app/(dashboard)/email/page.tsx` + `email-workspace.tsx`:

- **Compose** tab — preserves the existing compose form.
- **Inbox** tab — paginated list, unread badge, click to open viewer.
- **Sent** tab — paginated list of sent messages from this user's Gmail.

Pagination uses a page-token stack (Gmail returns `nextPageToken`); Prev/Next buttons walk the stack. Refresh button reloads the current page and refetches the unread count.

Unread messages are visually distinguished (left bg tint + bold subject). Opening an unread inbox message marks it read in Gmail and decrements the badge optimistically.

### 5. Sidebar unread badge — `apps/web/app/(dashboard)/sidebar-nav.tsx`

A red badge with the unread count is rendered next to **Quick Email** in the left sidebar. When the sidebar is collapsed, the badge shrinks to a dot indicator.

The count is fetched server-side in `layout.tsx` in parallel with notifications:

```ts
const [unreadCount, recentNotifications, emailUnreadCount] = await Promise.all([
  getUnreadNotificationCount(user.id),
  getRecentNotifications(user.id, 5),
  showEmailNav ? getUnreadEmailCount() : Promise.resolve(0),
]);
```

`getUnreadEmailCount()` returns `0` if the user has no `user_google_tokens` row, so non-connected users (and roles without email access) pay zero Gmail-API cost.

## Steps taken

1. Added `gmail.readonly` scope to Google OAuth config + callback validation.
2. Implemented `listGmailMessages`, `getGmailMessage`, `getGmailUnreadCount`, `markGmailRead` in `lib/email/gmail.ts`.
3. Added `listEmailsAction`, `getEmailAction`, `getUnreadEmailCount` server actions.
4. Refactored `email-composer.tsx` → `email-workspace.tsx` with three tabs (Compose / Inbox / Sent).
5. Plumbed `emailUnreadCount` from `layout.tsx` → `DashboardShell` → `SidebarNav` and rendered a destructive-variant badge on the `/email` nav item.
6. Verified `tsc --noEmit` passes.

## Decisions & notes

- **Per-user, not per-tenant.** Confirmed the existing implementation already keys tokens by `user_id`. Each telefonista and owner connects (and disconnects) their own Gmail independently. No multi-account select needed.
- **Live Gmail, not local cache.** The history viewer reads directly from Gmail rather than from `email_logs` so it can show inbound mail and the true read/unread state.
- **`email_logs` remains** as a tenant-level audit trail of sends originating from the CRM (used by activity feed); it is not the source of truth for the viewer.
- **HTML rendering** uses a sandboxed iframe with no allow-flags — scripts, forms, navigation, and same-origin access are all blocked.
- **Token revocation** by the user on Google's side surfaces as a `401`; the token row is wiped and the UI prompts a reconnect.

## Reconnect required for existing users

Anyone already connected at the time of deploy will see:

> Connect your Gmail account to read email.

…in the Inbox/Sent tabs. They click **Disconnect → Connect Gmail** to re-consent with the new read scope.
