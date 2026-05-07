# Gmail Send Integration (Telefonista)

## Purpose

Telefonista and owner users can send email to prospects from their own Gmail
account. The CRM does not store, route, or rewrite the message — Google sends
it from the user's mailbox, and the message lands in the user's own "Sent"
folder.

Login remains email/password (Supabase Auth). Google OAuth is only invoked
on demand when the user clicks **Connect Gmail** on `/email`. Other roles
(`admin`, `rufero`, `super_admin`) cannot use this feature; the page shows
an explanatory placeholder.

## Architecture

```
Telefonista clicks "Connect Gmail"
        │
        ▼
GET /api/google/oauth/start
   - role-gate (must be telefonista or owner)
   - sign random state, set cookie
   - redirect → accounts.google.com (gmail.send + offline + prompt=consent)
        │
        ▼
GET /api/google/oauth/callback
   - verify state cookie
   - exchange code → { access_token, refresh_token }
   - fetch userinfo (Google email)
   - encrypt refresh_token (AES-256-GCM)
   - upsert user_google_tokens (service role)
   - redirect → /email?gmail_connected=1
        │
        ▼
Telefonista clicks "Send"
        │
        ▼
sendEmailAction (server action)
   - role-gate
   - sendGmail() → refresh access token if expired
                → POST RFC 822 base64url to gmail.googleapis.com
                → on 401, wipe token row (user must reconnect)
   - log to email_logs
```

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/022_user_google_tokens.sql` | Encrypted token storage + RLS |
| `apps/web/lib/google/config.ts` | OAuth URLs, scopes, env loader |
| `apps/web/lib/google/crypto.ts` | AES-256-GCM encrypt/decrypt for refresh tokens |
| `apps/web/app/api/google/oauth/start/route.ts` | Initiates OAuth (role-gated) |
| `apps/web/app/api/google/oauth/callback/route.ts` | Exchanges code, persists tokens |
| `apps/web/lib/email/gmail.ts` | Refresh + send via Gmail API |
| `apps/web/lib/email/actions.ts` | `sendEmailAction`, `getGmailConnection`, `disconnectGmail` |
| `apps/web/app/(dashboard)/email/page.tsx` | Role-gated page, loads connection |
| `apps/web/app/(dashboard)/email/email-composer.tsx` | Connect/disconnect + composer UI |

## Schema

`user_google_tokens` keyed by `user_id`. Refresh token is encrypted at rest;
the access token is cached in plaintext until expiry (it's short-lived and
safe to refresh). RLS lets a user `SELECT`/`DELETE` only their own row;
inserts and updates go through the service-role client.

## Setup

### Google Cloud Console

1. Create a project (or reuse one).
2. Enable **Gmail API**.
3. Configure the **OAuth consent screen**:
   - User type: External (or Internal if Workspace org)
   - Add restricted scope: `https://www.googleapis.com/auth/gmail.send`
   - Add test users while in Testing mode
4. Create credentials → **OAuth client ID** → Web application:
   - Authorized redirect URI: must match `GOOGLE_OAUTH_REDIRECT_URL`
     (e.g. `http://localhost:3000/api/google/oauth/callback` for dev,
     `https://app.roofaid.com/api/google/oauth/callback` for prod)
5. Copy client ID and secret into env vars.

### Environment variables

```env
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/api/google/oauth/callback
GOOGLE_TOKEN_ENC_KEY=<openssl rand -hex 32>
```

`GOOGLE_TOKEN_ENC_KEY` must be 32 bytes (64 hex chars). Rotating it
invalidates all stored refresh tokens — users will need to reconnect.

### Migration

```bash
supabase db push   # applies 022_user_google_tokens.sql
```

## Production gating (important)

`gmail.send` is a Google **restricted scope**. While the OAuth consent
screen is in **Testing** mode, only the listed test users can authorize. To
serve more users you must:

1. Submit the app for OAuth verification (brand verification + scope review).
2. Pass a CASA security assessment (third-party penetration test).
3. Provide a privacy policy and home page URL.

This typically takes weeks. Plan accordingly before launch.

## Quotas

- Free Gmail: ~500 sent messages per day per user.
- Google Workspace: ~2000 sent per day per user.
- Quotas are per Google account, not per CRM tenant.

## Error handling

| Condition | Behavior |
|-----------|----------|
| User is not telefonista or owner | Both UI and server return 403 |
| User clicks Send but no token row | UI shows "Connect Gmail" instead of Send; server returns `needsConnect: true` |
| Refresh token revoked | Token row is deleted; user is prompted to reconnect |
| Gmail API 401 | Token row is deleted; same path |
| Missing `gmail.send` consent | Callback redirects with `?gmail_error=missing_send_scope` |

## Decisions and trade-offs

- **Email/password login retained.** Mixing sign-in OAuth with send-on-behalf
  OAuth would have forced tenant auto-provisioning for new Google users and
  required capturing Supabase's provider refresh token, which it does not
  reliably expose for offline use. The on-demand connect flow we own is
  simpler and explicit about scope.
- **No email-match enforcement** between `users.email` and the connected
  Google email. Telefonistas often use a personal or work mailbox that
  differs from their CRM login.
- **Gmail send only — no Gmail read or mailbox sync.** Replies happen
  outside the CRM (in the user's own inbox) for now.
- **`email_logs.sendgrid_message_id` reused** to store the Gmail
  `messageId`. The column is misnamed historically; we did not rename to
  avoid touching unrelated migrations. Rename in a future migration if it
  causes confusion.
