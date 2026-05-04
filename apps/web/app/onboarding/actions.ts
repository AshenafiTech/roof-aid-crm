"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  purchaseNumber,
  releaseNumber,
  searchAvailableNumbers,
} from "@/lib/telnyx/client";
import { ensureTenantTelnyxConnection } from "@/lib/telnyx/ensure-tenant-connection";
import { TelnyxError } from "@/lib/telnyx/errors";
import type { AvailableNumber } from "@/lib/telnyx/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Auth helper — must be a tenant owner/admin to provision numbers
// ---------------------------------------------------------------------------

async function requireTenantOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, tenant_id, role, email")
    .eq("id", user.id)
    .single();
  if (error || !profile) {
    throw new Error("Profile not found — finish step 1 (business profile) first");
  }
  if (profile.role !== "owner" && profile.role !== "admin" && profile.role !== "super_admin") {
    throw new Error("Only owners and admins can provision phone numbers");
  }

  return { supabase, profile };
}

// ---------------------------------------------------------------------------
// Search — area code → available numbers
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  areaCode: z
    .string()
    .trim()
    .regex(/^\d{3}$/, "Area code must be 3 digits"),
});

export async function searchNumbers(input: {
  areaCode: string;
}): Promise<{ ok: true; numbers: AvailableNumber[] } | { ok: false; error: string }> {
  try {
    await requireTenantOwner();
    const parsed = searchSchema.parse(input);
    const numbers = await searchAvailableNumbers({
      areaCode: parsed.areaCode,
      features: ["voice", "sms"],
      limit: 20,
    });
    return { ok: true, numbers };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Purchase + attach — Telnyx order, then DB row, with safety net
// ---------------------------------------------------------------------------

const purchaseSchema = z.object({
  e164: z
    .string()
    .trim()
    .regex(/^\+1\d{10}$/, "Phone number must be E.164 (+1 followed by 10 digits)"),
  label: z.string().trim().min(1).max(50).default("Main"),
});

export type PurchaseResult =
  | { ok: true; phone_number_id: string; e164: string }
  | { ok: false; error: string };

export async function purchaseAndAttachNumber(input: {
  e164: string;
  label?: string;
}): Promise<PurchaseResult> {
  let profileTenantId: string | null = null;
  let userId: string | null = null;
  let purchasedTelnyxId: string | null = null;

  try {
    const { profile } = await requireTenantOwner();
    profileTenantId = profile.tenant_id;
    userId = profile.id;

    const parsed = purchaseSchema.parse({
      e164: input.e164,
      label: input.label ?? "Main",
    });

    // Service-role client to bypass RLS for the existing-primary check and
    // for the eventual INSERT — we already verified the caller is an owner.
    const admin = createAdminClient();

    // Don't let an owner buy a second "primary" number — they'd overwrite
    // their own caller ID and confuse routing. Adding more numbers (non-primary)
    // happens from the settings page, not onboarding.
    const { data: existingPrimary } = await admin
      .from("tenant_phone_numbers")
      .select("id, e164")
      .eq("tenant_id", profileTenantId)
      .eq("is_primary", true)
      .eq("status", "active")
      .maybeSingle();

    if (existingPrimary) {
      return {
        ok: false,
        error: `Tenant already has a primary number (${existingPrimary.e164}). Manage additional numbers from Settings.`,
      };
    }

    // 1. Ensure tenant has a Telnyx Credentials Connection. Required for
    //    the WebRTC softphone — without it, /api/telnyx/credentials rejects
    //    and reps can't make/receive calls. Idempotent: returns existing
    //    connection id if one is already set.
    const { data: tenantInfo, error: tenantInfoErr } = await admin
      .from("tenants")
      .select("slug")
      .eq("id", profileTenantId)
      .single();
    if (tenantInfoErr || !tenantInfo) {
      return { ok: false, error: "Tenant lookup failed" };
    }
    const connectionId = await ensureTenantTelnyxConnection({
      admin,
      tenantId: profileTenantId,
      tenantSlug: tenantInfo.slug,
    });

    // 2. Purchase from Telnyx and atomically attach to the tenant's connection
    //    + the platform messaging profile.
    const purchased = await purchaseNumber({
      e164: parsed.e164,
      connectionId,
    });
    purchasedTelnyxId = purchased.telnyx_number_id;

    // 2. Insert tenant_phone_numbers row
    const { data: row, error: insertErr } = await admin
      .from("tenant_phone_numbers")
      .insert({
        tenant_id: profileTenantId,
        telnyx_number_id: purchased.telnyx_number_id,
        e164: purchased.e164,
        capabilities: purchased.capabilities,
        messaging_profile_id: purchased.messaging_profile_id,
        voice_app_id: purchased.voice_app_id,
        label: parsed.label,
        is_primary: true,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      // Number bought but DB write failed — release the number to avoid
      // a paid-for orphan. If release also fails, we've leaked $1/mo until
      // someone notices. Log loudly.
      await safeReleaseNumber(purchasedTelnyxId, insertErr?.message);
      return {
        ok: false,
        error: `Number purchased but database write failed (${insertErr?.message ?? "unknown"}). Release attempted; please contact support if charged.`,
      };
    }

    revalidatePath("/onboarding");
    revalidatePath("/admin/settings/phone-numbers");

    return { ok: true, phone_number_id: row.id, e164: purchased.e164 };
  } catch (err) {
    // Mid-flight failure that didn't get caught above
    if (purchasedTelnyxId) {
      await safeReleaseNumber(purchasedTelnyxId, errorMessage(err));
    }
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function safeReleaseNumber(telnyxNumberId: string, originalError?: string) {
  try {
    await releaseNumber(telnyxNumberId);
    console.error(
      `[onboarding] Released orphan Telnyx number ${telnyxNumberId} after DB failure: ${originalError ?? "n/a"}`,
    );
  } catch (releaseErr) {
    console.error(
      `[onboarding] CRITICAL: failed to release orphan Telnyx number ${telnyxNumberId}. ` +
        `Manual intervention required. Original DB error: ${originalError}. Release error: ${errorMessage(releaseErr)}`,
    );
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof TelnyxError) return err.message;
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => i.message).join("; ");
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
