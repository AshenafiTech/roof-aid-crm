// tenantFromTo() — resolve tenant context from a dialed/texted number.
//
// Stage 1.5 puts every tenant's number in `tenant_phone_numbers`. The
// webhook gets an inbound event for some `to` number (the homeowner
// dialed/texted us), and we have to figure out which tenant owns that
// line so the row lands under the right RLS scope.
//
// Returns null for unknown numbers — those are pre-purchase inventory
// probes or stale numbers; the caller logs to webhook_events.process_error
// and 200s anyway.

import { admin } from "./supabase-admin.ts";

export interface TenantContext {
  tenant_id: string;
  tenant_phone_number_id: string;
}

export async function tenantFromTo(
  e164: string,
): Promise<TenantContext | null> {
  const { data, error } = await admin
    .from("tenant_phone_numbers")
    .select("id, tenant_id")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[tenantFromTo] lookup failed", error);
    return null;
  }
  if (!data) return null;

  return {
    tenant_id: data.tenant_id,
    tenant_phone_number_id: data.id,
  };
}
