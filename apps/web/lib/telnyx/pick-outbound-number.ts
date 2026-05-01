// Pick the outbound `from` number for a given prospect + capability.
//
// Per Stage 1.5 design, every tenant owns 1+ numbers. The rule:
//   1. If the rep explicitly picked one ("Send from" dropdown), use it
//      (provided it's active and supports the capability).
//   2. Otherwise, prefer the number that the prospect last texted/called us on
//      — keeps the conversation on a single line (homeowners get
//      confused when replies come from a different number than the one
//      that just texted them).
//   3. Otherwise, fall back to the tenant's primary active number with
//      the requested capability.
//
// `TELNYX_DEFAULT_NUMBER` is dev-only fallback — never consulted in the
// production path.

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface PickedNumber {
  id: string;
  e164: string;
  capabilities: string[];
}

export type Capability = "voice" | "sms";

export interface PickOpts {
  tenantId: string;
  prospectId?: string;
  preferredNumberId?: string;
  capability: Capability;
}

export class NoOutboundNumberError extends Error {
  constructor(message = "Tenant has no active number with the required capability") {
    super(message);
    this.name = "NoOutboundNumberError";
  }
}

export async function pickOutboundNumber(opts: PickOpts): Promise<PickedNumber> {
  const admin = createAdminClient();

  // 1. Explicit pick (rep used the "Send from" dropdown)
  if (opts.preferredNumberId) {
    const { data } = await admin
      .from("tenant_phone_numbers")
      .select("id, e164, capabilities")
      .eq("id", opts.preferredNumberId)
      .eq("tenant_id", opts.tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (data && data.capabilities.includes(opts.capability)) {
      return { id: data.id, e164: data.e164, capabilities: data.capabilities };
    }
    // fall through if the picked one is gone or lacks capability
  }

  // 2. Match the last inbound number for this prospect (conversation continuity)
  if (opts.prospectId) {
    const { data: lastInbound } = await admin
      .from("sms_logs")
      .select("tenant_phone_number_id, to_number")
      .eq("tenant_id", opts.tenantId)
      .eq("prospect_id", opts.prospectId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastInbound?.tenant_phone_number_id) {
      const { data: num } = await admin
        .from("tenant_phone_numbers")
        .select("id, e164, capabilities")
        .eq("id", lastInbound.tenant_phone_number_id)
        .eq("status", "active")
        .maybeSingle();
      if (num && num.capabilities.includes(opts.capability)) {
        return { id: num.id, e164: num.e164, capabilities: num.capabilities };
      }
    }
  }

  // 3. Tenant primary
  const { data: primary } = await admin
    .from("tenant_phone_numbers")
    .select("id, e164, capabilities")
    .eq("tenant_id", opts.tenantId)
    .eq("is_primary", true)
    .eq("status", "active")
    .contains("capabilities", [opts.capability])
    .maybeSingle();

  if (primary) {
    return { id: primary.id, e164: primary.e164, capabilities: primary.capabilities };
  }

  // 4. Any active number with capability — last resort before throwing
  const { data: anyActive } = await admin
    .from("tenant_phone_numbers")
    .select("id, e164, capabilities")
    .eq("tenant_id", opts.tenantId)
    .eq("status", "active")
    .contains("capabilities", [opts.capability])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyActive) {
    return {
      id: anyActive.id,
      e164: anyActive.e164,
      capabilities: anyActive.capabilities,
    };
  }

  throw new NoOutboundNumberError();
}
