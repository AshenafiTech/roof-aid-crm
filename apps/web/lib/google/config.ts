export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

export const GOOGLE_OAUTH_SCOPES = [
  USERINFO_EMAIL_SCOPE,
  GMAIL_SEND_SCOPE,
  GMAIL_READONLY_SCOPE,
];

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SEND_URL = `${GMAIL_API_BASE}/messages/send`;
export const GMAIL_MESSAGES_URL = `${GMAIL_API_BASE}/messages`;

export function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL",
    );
  }
  return { clientId, clientSecret, redirectUri };
}
