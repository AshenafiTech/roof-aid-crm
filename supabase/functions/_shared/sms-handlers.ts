// SMS event handlers for the Telnyx webhook.
//
// Stage 3 handles four event types:
//   - message.received  -> inbound from homeowner
//   - message.sent      -> Telnyx accepted our outbound (intermediate)
//   - message.finalized -> terminal status: delivered or failed (Telnyx
//                          uses message.finalized in v2 webhooks; we
//                          inspect the inner payload for the actual outcome)
//
// All four use the audit row that the parent dispatcher already wrote
// to webhook_events, so this module focuses on the application-level
// effects: sms_logs upserts, STOP-keyword DNC, notifications.

import { admin } from "./supabase-admin.ts";
import { tenantFromTo } from "./tenant-from-to.ts";

const STOP_KEYWORD_REGEX = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const STOP_REPLY_TEXT =
  "You've been unsubscribed. Reply START to opt back in.";

interface InboundEventPayload {
  id: string;
  from?: { phone_number?: string };
  to?: Array<{ phone_number?: string }>;
  text?: string;
  received_at?: string;
  messaging_profile_id?: string;
}

interface OutboundEventPayload {
  id: string;
  to?: Array<{ phone_number?: string; status?: string }>;
  errors?: Array<{ code?: string; title?: string; detail?: string }>;
}

// ----------------------------------------------------------------------------
// Inbound — message.received
// ----------------------------------------------------------------------------

export async function handleInboundSms(payload: InboundEventPayload): Promise<void> {
  const messageId = payload.id;
  const fromE164 = payload.from?.phone_number;
  const toE164 = payload.to?.[0]?.phone_number;
  const body = payload.text ?? "";

  if (!messageId || !fromE164 || !toE164) {
    console.error("[handleInboundSms] missing required fields", payload);
    return;
  }

  const ctx = await tenantFromTo(toE164);
  if (!ctx) {
    // Number isn't ours (anymore). Nothing actionable; the parent
    // already audited the event.
    console.warn(`[handleInboundSms] unknown to-number: ${toE164}`);
    return;
  }

  const prospect = await findProspectByPhone(ctx.tenant_id, fromE164);

  // 1. Upsert the inbound row first so the conversation thread is correct
  //    even if STOP processing fails afterward.
  const { error: upsertErr } = await admin
    .from("sms_logs")
    .upsert(
      {
        provider_message_id: messageId,
        tenant_id: ctx.tenant_id,
        tenant_phone_number_id: ctx.tenant_phone_number_id,
        prospect_id: prospect?.id ?? null,
        direction: "inbound",
        body,
        status: "received",
        from_number: fromE164,
        to_number: toE164,
      },
      { onConflict: "provider_message_id", ignoreDuplicates: true },
    );

  if (upsertErr) {
    console.error("[handleInboundSms] upsert failed", upsertErr);
  }

  // 2. STOP keyword? Mark DNC, send the TCPA-required acknowledgement.
  //    This runs regardless of whether we found a prospect — the carrier
  //    expects a STOP ack against any number that texts STOP.
  if (STOP_KEYWORD_REGEX.test(body)) {
    if (prospect?.id) {
      const { error: dncErr } = await admin
        .from("prospects")
        .update({
          do_not_call: true,
          do_not_call_reason: "sms_stop_keyword",
          do_not_call_at: new Date().toISOString(),
        })
        .eq("id", prospect.id)
        .eq("tenant_id", ctx.tenant_id);
      if (dncErr) {
        console.error("[handleInboundSms] DNC flag failed", dncErr);
      }
    }

    // Send the STOP acknowledgement. This is required by TCPA and the
    // carriers expect to see it within ~30s. We do it inline here.
    await sendStopAcknowledgement({
      from: toE164,
      to: fromE164,
      tenantId: ctx.tenant_id,
      tenantPhoneNumberId: ctx.tenant_phone_number_id,
      prospectId: prospect?.id ?? null,
    });
  }

  // 3. Notify the assigned rep (if any) about the inbound message.
  //    Skip notification for STOP — that's noise.
  if (prospect && !STOP_KEYWORD_REGEX.test(body)) {
    const { error: notifErr } = await admin.from("notifications").insert({
      tenant_id: ctx.tenant_id,
      user_id: prospect.assigned_to ?? prospect.created_by,
      type: "inbound_sms",
      title: `New SMS from ${prospect.name ?? fromE164}`,
      body: body.slice(0, 100),
      related_id: prospect.id,
      related_type: "prospect",
    });
    if (notifErr) {
      console.error("[handleInboundSms] notification insert failed", notifErr);
    }
  }
}

// ----------------------------------------------------------------------------
// Outbound delivery status — message.sent / message.finalized
// ----------------------------------------------------------------------------

export async function handleOutboundSmsStatus(
  payload: OutboundEventPayload,
  newStatus: "sent" | "delivered" | "failed",
): Promise<void> {
  const messageId = payload.id;
  if (!messageId) {
    console.error("[handleOutboundSmsStatus] missing message id");
    return;
  }

  const update: { status: string; error_code?: string | null } = { status: newStatus };
  if (newStatus === "failed") {
    update.error_code = payload.errors?.[0]?.code ?? "unknown";
  }

  const { error } = await admin
    .from("sms_logs")
    .update(update)
    .eq("provider_message_id", messageId);

  if (error) {
    console.error(
      `[handleOutboundSmsStatus] update failed for ${messageId}`,
      error,
    );
  }
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

interface ProspectMatch {
  id: string;
  name: string | null;
  assigned_to: string | null;
  created_by: string | null;
}

async function findProspectByPhone(
  tenantId: string,
  e164: string,
): Promise<ProspectMatch | null> {
  // `phones` is text[] on prospects. Telnyx gives us E.164; older rows
  // may have stored variants like "(479) 555-0188" or "479-555-0188".
  // Normalize both sides for the lookup.
  const normalized = e164.replace(/\D/g, "");
  const { data, error } = await admin
    .from("prospects")
    .select("id, name, phones, assigned_to, created_by")
    .eq("tenant_id", tenantId)
    .limit(50);

  if (error || !data) {
    if (error) console.error("[findProspectByPhone] query failed", error);
    return null;
  }

  for (const row of data) {
    const phones = (row.phones ?? []) as string[];
    for (const p of phones) {
      const stripped = p.replace(/\D/g, "");
      if (
        stripped === normalized ||
        stripped === normalized.slice(-10) ||
        normalized === stripped.slice(-10)
      ) {
        return {
          id: row.id,
          name: row.name,
          assigned_to: row.assigned_to,
          created_by: row.created_by,
        };
      }
    }
  }
  return null;
}

async function sendStopAcknowledgement(opts: {
  from: string;
  to: string;
  tenantId: string;
  tenantPhoneNumberId: string;
  prospectId: string | null;
}): Promise<void> {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) {
    console.error(
      "[sendStopAcknowledgement] TELNYX_API_KEY missing — STOP ack skipped, regulatory risk",
    );
    return;
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        text: STOP_REPLY_TEXT,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[sendStopAcknowledgement] Telnyx ${res.status}: ${body.slice(0, 500)}`,
      );
      return;
    }

    const json = await res.json();
    // Log the auto-reply so it appears in the thread alongside the STOP.
    await admin.from("sms_logs").insert({
      provider_message_id: json.data?.id,
      tenant_id: opts.tenantId,
      tenant_phone_number_id: opts.tenantPhoneNumberId,
      prospect_id: opts.prospectId,
      direction: "outbound",
      body: STOP_REPLY_TEXT,
      status: "sent",
      from_number: opts.from,
      to_number: opts.to,
      segments: 1,
    });
  } catch (err) {
    console.error("[sendStopAcknowledgement] threw", err);
  }
}
