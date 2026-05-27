// POST /api/telnyx/credentials
//
// The browser softphone calls this on connect (and again every ~10 min when
// the previous token nears expiry). The handler:
//
//   1. Authenticates the caller via Supabase session.
//   2. Resolves their tenant + tenant's Telnyx credential connection id.
//   3. Mints a short-lived WebRTC login token against THAT connection only.
//
// The connection_id used here is the keystone of multi-tenant isolation —
// because each tenant has its own Telnyx Credentials Connection, the
// minted token cannot ring or dial through any other tenant's numbers.
// Inbound calls to Tenant A's numbers reach only Tenant A's logged-in
// browsers; same for outbound caller-ID.

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mintLoginToken } from "@/lib/telnyx/client";
import { TelnyxError } from "@/lib/telnyx/errors";

const ROLES_THAT_GET_SOFTPHONE = new Set([
  "owner",
  "admin",
  "telefonista",
  "super_admin",
]);

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("id, tenant_id, role, first_name, last_name")
      .eq("id", user.id)
      .single();
    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 401 });
    }
    if (!ROLES_THAT_GET_SOFTPHONE.has(profile.role)) {
      return NextResponse.json(
        { error: "Role not authorized to use the softphone" },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("telnyx_credential_connection_id")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantErr || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (!tenant.telnyx_credential_connection_id) {
      return NextResponse.json(
        {
          error:
            "Tenant has no calling configured. Set up phone numbers in Settings → Phone Numbers first.",
        },
        { status: 404 },
      );
    }

    // Pull the primary number — used as caller ID on outbound calls.
    const { data: primary } = await admin
      .from("tenant_phone_numbers")
      .select("e164")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_primary", true)
      .eq("status", "active")
      .maybeSingle();

    const cred = await mintLoginToken({
      connectionId: tenant.telnyx_credential_connection_id,
      name: `agent-${profile.id}-${Date.now()}`,
    });

    return NextResponse.json({
      // SDK auths with login + password (SIP user/pass) instead of JWT
      // login_token — more reliably accepted by Telnyx WebSocket auth.
      sip_username: cred.sip_username,
      sip_password: cred.sip_password,
      // Used by client.newCall() as `callerNumber` so outbound calls
      // show the tenant's number to the recipient
      caller_number: primary?.e164 ?? null,
      user: {
        id: profile.id,
        name:
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Agent",
      },
      // Telnyx credential session TTL — refresh well before expiry
      ttl_seconds: 60 * 30,
    });
  } catch (err) {
    if (err instanceof TelnyxError) {
      return NextResponse.json(
        { error: err.message },
        { status: 502 },
      );
    }
    console.error("[/api/telnyx/credentials] threw", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
