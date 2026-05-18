"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendSms as telnyxSendSms } from "@/lib/telnyx/client";
import { TelnyxError } from "@/lib/telnyx/errors";
import {
  NoOutboundNumberError,
  pickOutboundNumber,
} from "@/lib/telnyx/pick-outbound-number";

export type SendAdHocSmsResult =
  | {
      ok: true;
      sms_log_id: string;
      e164: string;
      provider_message_id: string;
      to: string;
      matched_prospect_id: string | null;
    }
  | {
      ok: false;
      error: string;
      requiresAcknowledgement?: ("dnc")[];
    };

const schema = z.object({
  to: z.string().trim().min(1),
  body: z.string().trim().min(1).max(1600),
  acknowledgedDnc: z.boolean().optional().default(false),
});

function smsSegments(text: string): number {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / cap));
}

function normalizeToE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 10 ? `+${digits}` : null;
  }
  if (trimmed.startsWith("00")) {
    const digits = trimmed.replace(/\D/g, "").slice(2);
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits[1])) {
    return `+${digits}`;
  }
  if (digits.length === 10 && /^[2-9]/.test(digits[0])) {
    return `+1${digits}`;
  }
  return null;
}

/**
 * Send an SMS to an arbitrary number (no prospect selected).
 * If a prospect on the tenant has the matching phone, attaches it
 * so the message lands in the prospect's thread too.
 */
export async function sendAdHocSms(input: {
  to: string;
  body: string;
  acknowledgedDnc?: boolean;
}): Promise<SendAdHocSmsResult> {
  let smsLogId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;

  try {
    const parsed = schema.parse(input);

    const e164 = normalizeToE164(parsed.to);
    if (!e164) {
      return {
        ok: false,
        error: "Enter a valid phone number (e.g. +14795551234 or 4795551234).",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Unauthorized" };

    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("id, tenant_id, role")
      .eq("id", user.id)
      .single();
    if (profileErr || !profile) {
      return { ok: false, error: "Profile not found" };
    }

    admin = createAdminClient();

    // Try to match a prospect on this tenant by phone
    const { data: prospectMatch } = await admin
      .from("prospects")
      .select("id, name, phones")
      .eq("tenant_id", profile.tenant_id)
      .contains("phones", [e164])
      .limit(1)
      .maybeSingle();

    const matchedProspectId: string | null = prospectMatch?.id ?? null;

    // If matched, defer to can_message RPC for the same gate the
    // prospect-flow uses. DNC is a soft-warning; everything else is
    // a hard block.
    if (matchedProspectId) {
      const { data: verdict, error: rpcErr } = await supabase.rpc("can_message", {
        p_prospect_id: matchedProspectId,
      });
      if (rpcErr) return { ok: false, error: rpcErr.message };
      const v = verdict as { allowed: boolean; reason: string };
      if (!v.allowed) {
        if (v.reason === "dnc") {
          if (!parsed.acknowledgedDnc) {
            return {
              ok: false,
              error: "This prospect is on the Do Not Call list.",
              requiresAcknowledgement: ["dnc"],
            };
          }
        } else {
          return { ok: false, error: `Cannot message: ${v.reason}` };
        }
      }
    }

    let from: Awaited<ReturnType<typeof pickOutboundNumber>>;
    try {
      from = await pickOutboundNumber({
        tenantId: profile.tenant_id,
        prospectId: matchedProspectId ?? undefined,
        capability: "sms",
      });
    } catch (err) {
      if (err instanceof NoOutboundNumberError) {
        return {
          ok: false,
          error: "No active SMS-capable number on this tenant. Set one up in Settings → Phone Numbers.",
        };
      }
      throw err;
    }

    const { data: inserted, error: insertErr } = await admin
      .from("sms_logs")
      .insert({
        tenant_id: profile.tenant_id,
        prospect_id: matchedProspectId,
        agent_id: profile.id,
        direction: "outbound",
        body: parsed.body,
        status: "queued",
        from_number: from.e164,
        to_number: e164,
        tenant_phone_number_id: from.id,
        segments: smsSegments(parsed.body),
        acknowledged_warnings: parsed.acknowledgedDnc ? ["dnc"] : [],
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return { ok: false, error: insertErr?.message ?? "Insert failed" };
    }
    smsLogId = inserted.id;

    let providerMessageId: string;
    try {
      const res = await telnyxSendSms({
        from: from.e164,
        to: e164,
        text: parsed.body,
      });
      providerMessageId = res.messageId;
    } catch (err) {
      await admin
        .from("sms_logs")
        .update({
          status: "failed",
          error_code: err instanceof TelnyxError ? err.code ?? "telnyx_error" : "client_error",
        })
        .eq("id", smsLogId);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "SMS send failed",
      };
    }

    await admin
      .from("sms_logs")
      .update({
        provider_message_id: providerMessageId,
        telnyx_message_id: providerMessageId,
        status: "sent",
      })
      .eq("id", smsLogId);

    revalidatePath("/sms");
    if (matchedProspectId) {
      revalidatePath(`/prospects/${matchedProspectId}`);
    }

    return {
      ok: true,
      sms_log_id: smsLogId,
      e164: from.e164,
      provider_message_id: providerMessageId,
      to: e164,
      matched_prospect_id: matchedProspectId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}
