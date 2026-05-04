// Call event handlers for the Telnyx webhook.
//
// Telnyx emits 4+ events per call lifecycle:
//   - call.initiated         — outbound dial started, or inbound ringing
//   - call.answered          — both legs connected
//   - call.hangup            — call ended (carries hangup_cause, duration)
//   - call.recording.saved   — recording URL ready
//
// Each event has its own webhook event id, but the SAME call_control_id.
// We UPSERT keyed on telnyx_call_id (= call_control_id) so we get one
// rolled-up row per call regardless of event order or retries.
//
// Inbound calls also need tenant resolution from the dialed `to` number,
// and a routing-rule dispatch (ring_all / assigned_rep_first_then_all /
// voicemail_only). The actual SIP/WebRTC fan-out is performed by
// answering the call via Telnyx Call Control HTTP — we only persist
// state and decide which agents to ring.
//
// Idempotency: every UPDATE is keyed on telnyx_call_id, so replays are
// safe. We also guard against out-of-order events (e.g. hangup arrives
// before answered) by only nulling fields we *know* about for the
// current event.

import { admin } from "./supabase-admin.ts";
import { tenantFromTo } from "./tenant-from-to.ts";

interface TelnyxCallPayload {
  call_control_id?: string;
  call_session_id?: string;
  call_leg_id?: string;
  connection_id?: string;
  direction?: "incoming" | "outgoing";
  from?: string;
  to?: string;
  state?: string;
  start_time?: string;
  end_time?: string;
  answered_time?: string;
  hangup_cause?: string;
  hangup_source?: string;
  recording_urls?: { mp3?: string; wav?: string };
  recording_id?: string;
  duration_millis?: number;
  client_state?: string; // base64-encoded; we ignore it for now
}

interface CallRow {
  id: string;
  tenant_id: string;
  prospect_id: string | null;
  tenant_phone_number_id: string | null;
  agent_id: string | null;
  direction: "inbound" | "outbound";
  recording_storage_path: string | null;
}

// ----------------------------------------------------------------------------
// call.initiated
//
// Outbound: the row was already inserted by the web softphone before
// dialing — we just stamp telnyx_call_id and started_at.
//
// Inbound: brand-new ring. Resolve tenant, attempt prospect match by
// caller's E.164, insert a fresh row, and let the dispatcher figure out
// who to ring (we don't ring anybody from this handler — that's the
// frontend's job via a separate notification).
// ----------------------------------------------------------------------------

export async function handleCallInitiated(
  payload: TelnyxCallPayload,
): Promise<void> {
  const callId = payload.call_control_id;
  if (!callId) {
    console.error("[handleCallInitiated] missing call_control_id");
    return;
  }

  const direction: "inbound" | "outbound" =
    payload.direction === "incoming" ? "inbound" : "outbound";

  if (direction === "outbound") {
    // The softphone inserted a 'queued' row before dialing. Bind the
    // Telnyx id to it so subsequent events find the row. We match the
    // most recent outbound row for this from→to pair without a
    // telnyx_call_id yet. Fallback: insert a row if no match (defensive).
    const { data: candidates, error: findErr } = await admin
      .from("call_logs")
      .select("id")
      .is("telnyx_call_id", null)
      .eq("from_number", payload.from ?? "")
      .eq("to_number", payload.to ?? "")
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1);

    if (findErr) {
      console.error("[handleCallInitiated] outbound lookup failed", findErr);
    }

    const targetId = candidates?.[0]?.id;
    if (targetId) {
      const { error: bindErr } = await admin
        .from("call_logs")
        .update({
          telnyx_call_id: callId,
          started_at: payload.start_time ?? new Date().toISOString(),
        })
        .eq("id", targetId);
      if (bindErr) {
        console.error("[handleCallInitiated] outbound bind failed", bindErr);
      }
    } else {
      console.warn(
        `[handleCallInitiated] no pre-inserted outbound row for ${payload.from}→${payload.to}, creating one`,
      );
      // Defensive insert so we don't lose the call.
      const ctx = payload.from ? await tenantFromTo(payload.from) : null;
      if (ctx) {
        await admin.from("call_logs").upsert(
          {
            tenant_id: ctx.tenant_id,
            tenant_phone_number_id: ctx.tenant_phone_number_id,
            direction: "outbound",
            from_number: payload.from ?? null,
            to_number: payload.to ?? null,
            telnyx_call_id: callId,
            started_at: payload.start_time ?? new Date().toISOString(),
          },
          { onConflict: "telnyx_call_id" },
        );
      }
    }
    return;
  }

  // Inbound: resolve tenant from the dialed `to`
  const toE164 = payload.to;
  if (!toE164) {
    console.error("[handleCallInitiated] inbound with no to_number");
    return;
  }
  const ctx = await tenantFromTo(toE164);
  if (!ctx) {
    console.warn(`[handleCallInitiated] inbound to unknown number ${toE164}`);
    return;
  }

  // Prospect match (best-effort)
  const fromE164 = payload.from ?? "";
  const prospect = fromE164
    ? await findProspectByPhone(ctx.tenant_id, fromE164)
    : null;

  await admin.from("call_logs").upsert(
    {
      tenant_id: ctx.tenant_id,
      tenant_phone_number_id: ctx.tenant_phone_number_id,
      prospect_id: prospect?.id ?? null,
      direction: "inbound",
      from_number: fromE164 || null,
      to_number: toE164,
      telnyx_call_id: callId,
      started_at: payload.start_time ?? new Date().toISOString(),
    },
    { onConflict: "telnyx_call_id" },
  );

  // Notify the assigned rep (if any). The actual ring/answer is
  // performed by the WebRTC clients subscribed via Realtime; this is
  // their cue to render the incoming-call banner.
  if (prospect?.assigned_to) {
    await admin.from("notifications").insert({
      tenant_id: ctx.tenant_id,
      user_id: prospect.assigned_to,
      type: "inbound_call",
      title: `Incoming call from ${prospect.name ?? fromE164}`,
      body: fromE164,
      related_id: prospect.id,
      related_type: "prospect",
    });
  }
}

// ----------------------------------------------------------------------------
// call.answered
// ----------------------------------------------------------------------------

export async function handleCallAnswered(
  payload: TelnyxCallPayload,
): Promise<void> {
  const callId = payload.call_control_id;
  if (!callId) return;

  const { error } = await admin
    .from("call_logs")
    .update({
      answered_at: payload.answered_time ?? new Date().toISOString(),
    })
    .eq("telnyx_call_id", callId);

  if (error) {
    console.error(`[handleCallAnswered] update failed for ${callId}`, error);
  }
}

// ----------------------------------------------------------------------------
// call.hangup
// ----------------------------------------------------------------------------

export async function handleCallHangup(
  payload: TelnyxCallPayload,
): Promise<void> {
  const callId = payload.call_control_id;
  if (!callId) return;

  // Telnyx sends duration_millis on hangup. If absent, we'll let the
  // disposition modal compute it from started_at/ended_at.
  const durationSec = typeof payload.duration_millis === "number"
    ? Math.max(0, Math.round(payload.duration_millis / 1000))
    : null;

  // Map hangup_cause to our disposition vocabulary as a best-effort
  // default. The agent's disposition modal can still override it.
  const auto = mapHangupToDisposition(payload.hangup_cause);

  const update: Record<string, unknown> = {
    ended_at: payload.end_time ?? new Date().toISOString(),
    hangup_cause: payload.hangup_cause ?? null,
    hangup_source: payload.hangup_source ?? null,
  };
  if (durationSec !== null) update.duration_seconds = durationSec;
  if (auto && !payload.client_state) update.disposition = auto;

  const { error } = await admin
    .from("call_logs")
    .update(update)
    .eq("telnyx_call_id", callId);

  if (error) {
    console.error(`[handleCallHangup] update failed for ${callId}`, error);
  }
}

// ----------------------------------------------------------------------------
// call.recording.saved
// ----------------------------------------------------------------------------

export async function handleCallRecordingSaved(
  payload: TelnyxCallPayload,
): Promise<void> {
  const callId = payload.call_control_id;
  if (!callId) return;
  const url = payload.recording_urls?.mp3 ?? payload.recording_urls?.wav;
  if (!url) {
    console.warn("[handleCallRecordingSaved] no recording url in payload");
    return;
  }

  // Look up the call so we can build the canonical storage path.
  const { data: row, error: lookupErr } = await admin
    .from("call_logs")
    .select("id, tenant_id, recording_storage_path")
    .eq("telnyx_call_id", callId)
    .maybeSingle();

  if (lookupErr || !row) {
    console.error(
      `[handleCallRecordingSaved] no call_logs row for ${callId}`,
      lookupErr,
    );
    return;
  }

  // Stamp the Telnyx URL immediately so the UI has *something* playable
  // even if the copy-to-Storage step (deferred to a tasks-queue worker)
  // hasn't run yet.
  if (!row.recording_storage_path) {
    await admin
      .from("call_logs")
      .update({ recording_url: url })
      .eq("id", row.id);
  }

  // Enqueue the copy-to-Storage task. This keeps the webhook fast
  // (Telnyx retries on slow handlers) and lets a separate worker do
  // the long fetch + Storage upload.
  await admin.from("tasks").insert({
    kind: "copy_call_recording",
    payload: {
      call_log_id: row.id,
      tenant_id: row.tenant_id,
      telnyx_call_id: callId,
      source_url: url,
      storage_path: `${row.tenant_id}/${row.id}.mp3`,
    },
    scheduled_at: new Date().toISOString(),
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface ProspectMatch {
  id: string;
  name: string | null;
  assigned_to: string | null;
}

async function findProspectByPhone(
  tenantId: string,
  e164: string,
): Promise<ProspectMatch | null> {
  const normalized = e164.replace(/\D/g, "");
  const { data, error } = await admin
    .from("prospects")
    .select("id, name, phones, assigned_to")
    .eq("tenant_id", tenantId)
    .limit(50);
  if (error || !data) return null;

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
        };
      }
    }
  }
  return null;
}

function mapHangupToDisposition(cause: string | undefined): string | null {
  if (!cause) return null;
  switch (cause) {
    case "normal_clearing":
    case "originator_cancel":
      return "answered";
    case "user_busy":
      return "busy";
    case "no_answer":
    case "no_user_response":
    case "no_route_destination":
      return "no_answer";
    case "call_rejected":
    case "rejected":
      return "cancelled";
    case "unallocated_number":
    case "invalid_number_format":
    case "incompatible_destination":
      return "wrong_number";
    case "channel_unacceptable":
    case "destination_out_of_order":
    case "network_out_of_order":
    case "temporary_failure":
    case "switching_equipment_congestion":
      return "failed";
    default:
      return null;
  }
}

export type { TelnyxCallPayload, CallRow };
