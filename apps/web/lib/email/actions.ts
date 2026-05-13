"use server";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GmailNotConnectedError,
  getGmailMessage,
  getGmailUnreadCount,
  listGmailMessages,
  markGmailRead,
  sendGmail,
  type GmailListResult,
  type GmailMessageDetail,
} from "@/lib/email/gmail";

const sendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(50_000),
  prospectId: z.string().uuid().optional(),
});

export type SendEmailResult =
  | { ok: true; messageId: string; from: string }
  | { ok: false; error: string; needsConnect?: boolean };

export async function sendEmailAction(input: {
  to: string;
  subject: string;
  body: string;
  prospectId?: string;
}): Promise<SendEmailResult> {
  let parsed: z.infer<typeof sendSchema>;
  try {
    parsed = sendSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof z.ZodError ? err.issues[0].message : "Invalid input",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id, tenant_id, role, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return { ok: false, error: "Profile not found" };
  }

  if (profile.role !== "telefonista" && profile.role !== "owner") {
    return {
      ok: false,
      error: "Email send is only available for telefonista and owner users.",
    };
  }

  const fromName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;

  try {
    const sent = await sendGmail({
      userId: profile.id,
      fromName,
      to: parsed.to,
      subject: parsed.subject,
      body: parsed.body,
    });

    const admin = createAdminClient();
    await admin.from("email_logs").insert({
      tenant_id: profile.tenant_id,
      prospect_id: parsed.prospectId ?? null,
      agent_id: profile.id,
      direction: "outbound",
      subject: parsed.subject,
      body: parsed.body,
      status: "sent",
      sendgrid_message_id: sent.messageId,
    });

    return { ok: true, messageId: sent.messageId, from: sent.fromEmail };
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return {
        ok: false,
        error: "Connect your Gmail account to send email.",
        needsConnect: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}

export type GmailConnection = {
  connected: boolean;
  email: string | null;
};

export async function getGmailConnection(): Promise<GmailConnection> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { connected: false, email: null };

  const { data } = await supabase
    .from("user_google_tokens")
    .select("google_email")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    connected: !!data,
    email: data?.google_email ?? null,
  };
}

export async function disconnectGmail(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase.from("user_google_tokens").delete().eq("user_id", user.id);
  return { ok: true };
}

const EMAIL_PAGE_SIZE = 20;

export type ListEmailsResult =
  | { ok: true; data: GmailListResult; unreadCount: number }
  | { ok: false; error: string; needsConnect?: boolean };

export async function listEmailsAction(input: {
  folder: "INBOX" | "SENT";
  pageToken?: string | null;
}): Promise<ListEmailsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  try {
    const [data, unreadCount] = await Promise.all([
      listGmailMessages({
        userId: user.id,
        labelId: input.folder,
        pageToken: input.pageToken ?? null,
        pageSize: EMAIL_PAGE_SIZE,
      }),
      input.folder === "INBOX"
        ? getGmailUnreadCount(user.id)
        : Promise.resolve(0),
    ]);
    return { ok: true, data, unreadCount };
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return {
        ok: false,
        error: "Connect your Gmail account to read email.",
        needsConnect: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load emails",
    };
  }
}

export type GetEmailResult =
  | { ok: true; data: GmailMessageDetail }
  | { ok: false; error: string; needsConnect?: boolean };

export async function getEmailAction(input: {
  messageId: string;
  markRead?: boolean;
}): Promise<GetEmailResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  try {
    const data = await getGmailMessage(user.id, input.messageId);
    if (input.markRead && data.unread) {
      try {
        await markGmailRead(user.id, input.messageId);
        data.unread = false;
      } catch {
        // Non-fatal — viewer still shows the message.
      }
    }
    return { ok: true, data };
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return {
        ok: false,
        error: "Connect your Gmail account to read email.",
        needsConnect: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load email",
    };
  }
}

export async function getUnreadEmailCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: connected } = await supabase
    .from("user_google_tokens")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connected) return 0;

  try {
    return await getGmailUnreadCount(user.id);
  } catch {
    return 0;
  }
}
