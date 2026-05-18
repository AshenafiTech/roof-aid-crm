import { createAdminClient } from "@/lib/supabase/admin";
import {
  GMAIL_API_BASE,
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

// ============================================================
// Gmail read API helpers (list / get / unread count)
// ============================================================

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  fromName: string | null;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
};

export type GmailMessageDetail = GmailMessageSummary & {
  bodyText: string;
  bodyHtml: string | null;
};

export type GmailListResult = {
  messages: GmailMessageSummary[];
  nextPageToken: string | null;
  resultSizeEstimate: number;
};

async function gmailFetch(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { accessToken } = await getValidAccessToken(userId);
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    const admin = createAdminClient();
    await admin.from("user_google_tokens").delete().eq("user_id", userId);
    throw new GmailNotConnectedError();
  }
  return res;
}

function parseAddressHeader(value: string | undefined): {
  name: string | null;
  email: string;
} {
  if (!value) return { name: null, email: "" };
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || null, email: match[2].trim() };
  }
  return { name: null, email: value.trim() };
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

type GmailPayloadPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayloadPart[];
};

type GmailMessageRaw = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayloadPart;
  internalDate?: string;
};

function extractBody(payload: GmailPayloadPart | undefined): {
  text: string;
  html: string | null;
  hasAttachments: boolean;
} {
  const state: {
    text: string;
    html: string | null;
    hasAttachments: boolean;
  } = { text: "", html: null, hasAttachments: false };

  const walk = (part: GmailPayloadPart) => {
    if (part.filename && part.filename.length > 0) {
      state.hasAttachments = true;
    }
    if (part.mimeType === "text/plain" && part.body?.data && !state.text) {
      state.text = base64UrlDecode(part.body.data);
    } else if (
      part.mimeType === "text/html" &&
      part.body?.data &&
      !state.html
    ) {
      state.html = base64UrlDecode(part.body.data);
    }
    if (part.parts) part.parts.forEach(walk);
  };

  if (payload) walk(payload);
  if (!state.text && state.html) {
    state.text = state.html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return state;
}

function buildSummary(raw: GmailMessageRaw): GmailMessageSummary {
  const headers = raw.payload?.headers ?? [];
  const fromRaw = getHeader(headers, "From");
  const { name: fromName, email: fromEmail } = parseAddressHeader(fromRaw);
  const dateMs = raw.internalDate ? Number(raw.internalDate) : Date.now();
  const { hasAttachments } = extractBody(raw.payload);

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: fromRaw ?? "",
    fromName,
    fromEmail,
    to: getHeader(headers, "To") ?? "",
    subject: getHeader(headers, "Subject") ?? "(no subject)",
    snippet: raw.snippet ?? "",
    date: new Date(dateMs).toISOString(),
    unread: (raw.labelIds ?? []).includes("UNREAD"),
    hasAttachments,
  };
}

export type GmailListOptions = {
  userId: string;
  labelId: "INBOX" | "SENT";
  pageToken?: string | null;
  pageSize?: number;
  query?: string;
};

export async function listGmailMessages(
  opts: GmailListOptions,
): Promise<GmailListResult> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const params = new URLSearchParams({
    labelIds: opts.labelId,
    maxResults: String(pageSize),
  });
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  if (opts.query) params.set("q", opts.query);

  const res = await gmailFetch(opts.userId, `/messages?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail list failed (${res.status}): ${body}`);
  }
  const listData = (await res.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };

  const ids = (listData.messages ?? []).map((m) => m.id);
  if (ids.length === 0) {
    return {
      messages: [],
      nextPageToken: listData.nextPageToken ?? null,
      resultSizeEstimate: listData.resultSizeEstimate ?? 0,
    };
  }

  // Fetch metadata for each id in parallel (Gmail has no batch metadata
  // endpoint that's simpler than this for small page sizes).
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const metaParams = new URLSearchParams({
        format: "metadata",
        metadataHeaders: "From",
      });
      metaParams.append("metadataHeaders", "To");
      metaParams.append("metadataHeaders", "Subject");
      metaParams.append("metadataHeaders", "Date");
      const metaRes = await gmailFetch(
        opts.userId,
        `/messages/${id}?${metaParams.toString()}`,
      );
      if (!metaRes.ok) {
        const body = await metaRes.text();
        throw new Error(`Gmail get failed (${metaRes.status}): ${body}`);
      }
      const raw = (await metaRes.json()) as GmailMessageRaw;
      return buildSummary(raw);
    }),
  );

  return {
    messages: summaries,
    nextPageToken: listData.nextPageToken ?? null,
    resultSizeEstimate: listData.resultSizeEstimate ?? 0,
  };
}

export async function getGmailMessage(
  userId: string,
  messageId: string,
): Promise<GmailMessageDetail> {
  const res = await gmailFetch(
    userId,
    `/messages/${encodeURIComponent(messageId)}?format=full`,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail get failed (${res.status}): ${body}`);
  }
  const raw = (await res.json()) as GmailMessageRaw;
  const summary = buildSummary(raw);
  const { text, html } = extractBody(raw.payload);
  return { ...summary, bodyText: text, bodyHtml: html };
}

export async function getGmailUnreadCount(userId: string): Promise<number> {
  // Use labels endpoint — Gmail returns messagesUnread on each label.
  const res = await gmailFetch(userId, `/labels/INBOX`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail unread fetch failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { messagesUnread?: number };
  return data.messagesUnread ?? 0;
}

export async function markGmailRead(
  userId: string,
  messageId: string,
): Promise<void> {
  const res = await gmailFetch(
    userId,
    `/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    },
  );
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Gmail modify failed (${res.status}): ${body}`);
  }
}

