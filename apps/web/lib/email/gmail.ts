import { createAdminClient } from "@/lib/supabase/admin";
import {
  GMAIL_SEND_URL,
  GOOGLE_TOKEN_URL,
  getOAuthConfig,
} from "@/lib/google/config";
import { decryptSecret } from "@/lib/google/crypto";

type TokenRow = {
  user_id: string;
  tenant_id: string;
  google_email: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  refresh_token_tag: string;
  access_token: string | null;
  access_token_expires_at: string | null;
};

const ACCESS_TOKEN_SKEW_MS = 60_000;

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  const { clientId, clientSecret } = getOAuthConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GmailAuthError(`Refresh failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail is not connected for this user");
    this.name = "GmailNotConnectedError";
  }
}

async function getValidAccessToken(userId: string): Promise<{
  accessToken: string;
  fromEmail: string;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_google_tokens")
    .select(
      "user_id, tenant_id, google_email, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, access_token, access_token_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new GmailNotConnectedError();

  const row = data as TokenRow;

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;
  const isFresh =
    row.access_token && expiresAt - Date.now() > ACCESS_TOKEN_SKEW_MS;

  if (isFresh && row.access_token) {
    return { accessToken: row.access_token, fromEmail: row.google_email };
  }

  const refreshToken = decryptSecret({
    ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv,
    tag: row.refresh_token_tag,
  });

  let refreshed;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof GmailAuthError) {
      // Refresh token revoked or invalid → wipe so the user can reconnect.
      await admin.from("user_google_tokens").delete().eq("user_id", userId);
      throw new GmailNotConnectedError();
    }
    throw err;
  }

  await admin
    .from("user_google_tokens")
    .update({
      access_token: refreshed.accessToken,
      access_token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { accessToken: refreshed.accessToken, fromEmail: row.google_email };
}

function buildRfc822({
  from,
  fromName,
  to,
  subject,
  body,
}: {
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  body: string;
}): string {
  const fromHeader = fromName ? `${fromName} <${from}>` : from;
  // Encode subject per RFC 2047 if it has non-ASCII so accents/emoji work.
  const encodedSubject = /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`
    : subject;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendGmailInput = {
  userId: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
};

export type SendGmailResult = {
  messageId: string;
  threadId: string;
  fromEmail: string;
};

export async function sendGmail(input: SendGmailInput): Promise<SendGmailResult> {
  const { accessToken, fromEmail } = await getValidAccessToken(input.userId);

  const raw = base64UrlEncode(
    buildRfc822({
      from: fromEmail,
      fromName: input.fromName ?? null,
      to: input.to,
      subject: input.subject,
      body: input.body,
    }),
  );

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (res.status === 401) {
    // Token rejected → clear so user can reconnect.
    const admin = createAdminClient();
    await admin.from("user_google_tokens").delete().eq("user_id", input.userId);
    throw new GmailNotConnectedError();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return { messageId: data.id, threadId: data.threadId, fromEmail };
}
