// Server-only helper: ensure a tenant has a Telnyx Credentials Connection
// before they purchase their first number.
//
// Why: /api/telnyx/credentials (the softphone's auth path) requires
// tenants.telnyx_credential_connection_id to be set. Without one, agents
// cannot register WebRTC clients, so calls cannot be placed or received.
//
// We create the connection lazily on the first number purchase rather
// than at tenant creation because:
//   1. There's no end-user signup wizard yet — tenants are created via
//      seed scripts that don't have the Telnyx wrapper context.
//   2. Connection-create has no Telnyx cost; numbers do. Failing to
//      create a number after creating a connection costs nothing.
//   3. The picker is the only place a tenant currently expresses
//      "I'm ready to use telecom." First-purchase is the natural trigger.
//
// Idempotent: if the tenant already has a connection_id, returns it.
// Otherwise creates one, stamps it on the tenants row, returns the new id.

import "server-only";
import { randomBytes } from "crypto";

import { createCredentialConnection } from "@/lib/telnyx/client";
import { TelnyxError } from "@/lib/telnyx/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure tenant has a Telnyx Credentials Connection. Returns the connection id.
 * Throws on Telnyx or DB failures.
 *
 * The `admin` client must be a service-role client because we update tenants
 * (which has RLS allowing only super_admin updates).
 */
export async function ensureTenantTelnyxConnection(opts: {
  admin: SupabaseClient;
  tenantId: string;
  tenantSlug: string;
}): Promise<string> {
  // 1. Existing connection? Use it.
  const { data: tenant, error: readErr } = await opts.admin
    .from("tenants")
    .select("telnyx_credential_connection_id")
    .eq("id", opts.tenantId)
    .single();

  if (readErr) {
    throw new Error(`Tenant lookup failed: ${readErr.message}`);
  }
  if (tenant?.telnyx_credential_connection_id) {
    return tenant.telnyx_credential_connection_id;
  }

  // 2. Create a new connection on Telnyx.
  // Telnyx requires user_name and connection_name to be alphanumeric only —
  // no hyphens, underscores, or spaces. Strip the slug down before use.
  const slugAlnum = opts.tenantSlug.replace(/[^a-zA-Z0-9]/g, "");
  const nonce = randomBytes(3).toString("hex");
  const userName = `roofaid${slugAlnum}${nonce}`.slice(0, 32);
  const password = randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);

  let connection: { id: string };
  try {
    connection = await createCredentialConnection({
      connectionName: `${slugAlnum}WebRTC`,
      userName,
      password,
    });
  } catch (err) {
    if (err instanceof TelnyxError) {
      throw new Error(`Phone service connection setup failed: ${err.message}`);
    }
    throw err;
  }

  // 3. Stamp it on the tenants row. If this fails we've created an
  //    orphan connection on Telnyx — those are free and easy to garbage
  //    collect later, so we don't try to delete it inline.
  const { error: updateErr } = await opts.admin
    .from("tenants")
    .update({ telnyx_credential_connection_id: connection.id })
    .eq("id", opts.tenantId);

  if (updateErr) {
    console.error(
      `[ensureTenantTelnyxConnection] CRITICAL: created Telnyx connection ${connection.id} but failed to stamp on tenant ${opts.tenantId}: ${updateErr.message}`,
    );
    throw new Error(
      `Phone service connection was set up but could not be saved to your account. Please contact support and reference reference id ${connection.id}.`,
    );
  }

  return connection.id;
}
