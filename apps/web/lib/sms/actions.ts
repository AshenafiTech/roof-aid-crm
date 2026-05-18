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

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type WarningKind = "dnc" | "outside_calling_hours";

export type SendSmsResult =
  | {
      ok: true;
      sms_log_id: string;
      e164: string;
      provider_message_id: string;
    }
  | {
      ok: false;
      error: string;
      requiresAcknowledgement?: WarningKind[];
    };

const sendSchema = z.object({
  prospectId: z.string().uuid(),
  body: z.string().trim().min(1).max(1600),
  preferredNumberId: z.string().uuid().optional(),
  acknowledgedWarnings: z
    .array(z.enum(["dnc", "outside_calling_hours"]))
    .optional()
    .default([]),
});

// ----------------------------------------------------------------------------
// segment counter (matches the UI's display)
// Internal helper — Next.js disallows non-async exports in "use server" files,
// so this stays unexported. The UI composer has its own copy in
// components/comms/sms-composer.tsx.
// ----------------------------------------------------------------------------

function smsSegments(text: string): number {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / cap));
}

// ----------------------------------------------------------------------------
// Send
// ----------------------------------------------------------------------------

export async function sendSms(input: {
  prospectId: string;
  body: string;
  preferredNumberId?: string;
  acknowledgedWarnings?: WarningKind[];
}): Promise<SendSmsResult> {
  let smsLogId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;

  try {
    const parsed = sendSchema.parse(input);

    // 1. Auth + tenant context
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

    // 2. Compliance gate via can_message (RLS-scoped via the user's session)
    const { data: verdict, error: rpcErr } = await supabase.rpc("can_message", {
      p_prospect_id: parsed.prospectId,
    });
    if (rpcErr) {
      return { ok: false, error: rpcErr.message };
    }
    const v = verdict as { allowed: boolean; reason: string };

    if (!v.allowed) {
      // DNC is a confirmation, not a block — see /memory feedback_dnc_warning_only.
      // Other reasons remain hard blocks.
      if (v.reason === "dnc") {
        if (!parsed.acknowledgedWarnings.includes("dnc")) {
          return {
            ok: false,
            error: "This prospect is on the Do Not Call list.",
            requiresAcknowledgement: ["dnc"],
          };
        }
        // acknowledged → fall through and send
      } else {
        return { ok: false, error: messageForReason(v.reason) };
      }
    }

    // 3. Pick the outbound number
    let from: Awaited<ReturnType<typeof pickOutboundNumber>>;
    try {
      from = await pickOutboundNumber({
        tenantId: profile.tenant_id,
        prospectId: parsed.prospectId,
        preferredNumberId: parsed.preferredNumberId,
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

    // 4. Look up the recipient phone (first entry in prospects.phones)
    admin = createAdminClient();
    const { data: prospect, error: prospectErr } = await admin
      .from("prospects")
      .select("id, tenant_id, phones, name")
      .eq("id", parsed.prospectId)
      .single();
    if (prospectErr || !prospect) {
      return { ok: false, error: "Prospect not found" };
    }
    if (prospect.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Cross-tenant access denied" };
    }
    const toNumber = (prospect.phones ?? [])[0];
    if (!toNumber) {
      return { ok: false, error: "Prospect has no phone number" };
    }

    // 5. Insert the row as 'queued' so Realtime shows it immediately
    const { data: inserted, error: insertErr } = await admin
      .from("sms_logs")
      .insert({
        tenant_id: profile.tenant_id,
        prospect_id: parsed.prospectId,
        agent_id: profile.id,
        direction: "outbound",
        body: parsed.body,
        status: "queued",
        from_number: from.e164,
        to_number: toNumber,
        tenant_phone_number_id: from.id,
        segments: smsSegments(parsed.body),
        acknowledged_warnings: parsed.acknowledgedWarnings,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return { ok: false, error: insertErr?.message ?? "Insert failed" };
    }
    smsLogId = inserted.id;

    // 6. Call Telnyx
    let providerMessageId: string;
    try {
      const res = await telnyxSendSms({
        from: from.e164,
        to: toNumber,
        text: parsed.body,
      });
      providerMessageId = res.messageId;
    } catch (err) {
      // Mark the row failed so the UI shows the error state
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

    // 7. Update with provider id + status='sent'. The webhook will move
    //    it to 'delivered' or 'failed' when the carrier confirms.
    const { error: updateErr } = await admin
      .from("sms_logs")
      .update({
        provider_message_id: providerMessageId,
        telnyx_message_id: providerMessageId,
        status: "sent",
      })
      .eq("id", smsLogId);
    if (updateErr) {
      console.error("[sendSms] post-send update failed", updateErr);
      // Don't fail the request — the message went through; we'll log the
      // mismatch and rely on the webhook to reconcile.
    }

    revalidatePath(`/prospects/${parsed.prospectId}`);

    return {
      ok: true,
      sms_log_id: smsLogId,
      e164: from.e164,
      provider_message_id: providerMessageId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}

// ----------------------------------------------------------------------------
// Mark a previously failed SMS row as failed (for cleanup if anything
// throws before the catch above can update). Currently unused, kept here
// so we don't leave dangling 'queued' rows in pathological cases.
// ----------------------------------------------------------------------------

function messageForReason(reason: string): string {
  switch (reason) {
    case "no_phone":
      return "Prospect has no phone number on file.";
    case "cross_tenant":
      return "This prospect belongs to a different tenant.";
    case "not_found":
      return "Prospect not found.";
    case "tenant_has_no_sms_number":
      return "Your tenant has no SMS-capable phone number. Add one in Settings → Phone Numbers.";
    default:
      return `Cannot message: ${reason}`;
  }
}
