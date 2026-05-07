import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getOAuthConfig,
} from "@/lib/google/config";
import { encryptSecret } from "@/lib/google/crypto";

const STATE_COOKIE = "google_oauth_state";

function redirectToEmail(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/email", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToEmail(req, { gmail_error: error });
  }

  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectToEmail(req, { gmail_error: "invalid_state" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "telefonista" && profile.role !== "owner")) {
    return redirectToEmail(req, { gmail_error: "role_not_allowed" });
  }

  const { clientId, clientSecret, redirectUri } = getOAuthConfig();

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirectToEmail(req, { gmail_error: "token_exchange_failed" });
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  if (!tokens.refresh_token) {
    // Google omits refresh_token if the user previously consented and we
    // didn't force prompt=consent. We do force it, so this is unexpected.
    return redirectToEmail(req, { gmail_error: "no_refresh_token" });
  }

  // Look up the connected Google email
  const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) {
    return redirectToEmail(req, { gmail_error: "userinfo_failed" });
  }
  const userinfo = (await userinfoRes.json()) as { email: string };

  const grantedScopes = tokens.scope.split(" ");
  if (!grantedScopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    return redirectToEmail(req, { gmail_error: "missing_send_scope" });
  }

  const enc = encryptSecret(tokens.refresh_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const admin = createAdminClient();
  const { error: upsertErr } = await admin.from("user_google_tokens").upsert({
    user_id: profile.id,
    tenant_id: profile.tenant_id,
    google_email: userinfo.email,
    refresh_token_ciphertext: enc.ciphertext,
    refresh_token_iv: enc.iv,
    refresh_token_tag: enc.tag,
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    scopes: grantedScopes,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return redirectToEmail(req, { gmail_error: "db_upsert_failed" });
  }

  return redirectToEmail(req, { gmail_connected: "1" });
}
