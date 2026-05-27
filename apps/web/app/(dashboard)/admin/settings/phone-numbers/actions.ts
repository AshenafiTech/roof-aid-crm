"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  findPhoneNumberByE164,
  purchaseNumber,
  releaseNumber,
  searchAvailableNumbers,
} from "@/lib/telnyx/client";
import { ensureTenantTelnyxConnection } from "@/lib/telnyx/ensure-tenant-connection";
import { TelnyxError } from "@/lib/telnyx/errors";
import type { AvailableNumber } from "@/lib/telnyx/types";

// Must match the CHECK constraint in migration 020 (tpn_routing_rule_kind_check).
// Spec source: docs/milestone4/stage-1.5-tenant-phone-numbers.md §8.
const ROUTING_KINDS = [
  "ring_all",
  "assigned_rep_first_then_all",
  "voicemail_only",
] as const;
export type RoutingKind = (typeof ROUTING_KINDS)[number];

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

async function requireOwnerOrAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("Profile not found");
  if (
    profile.role !== "owner" &&
    profile.role !== "admin" &&
    profile.role !== "super_admin"
  ) {
    throw new Error("Only owners and admins can manage phone numbers");
  }

  return { profile };
}

function errorMessage(err: unknown): string {
  if (err instanceof TelnyxError) return err.message;
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join("; ");
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface TenantPhoneNumberRow {
  id: string;
  e164: string;
  label: string;
  is_primary: boolean;
  capabilities: string[];
  routing_rule: { kind: RoutingKind; voicemail_after_seconds?: number };
  status: "active" | "suspended" | "released";
  released_at: string | null;
  created_at: string;
}

export async function listPhoneNumbers(): Promise<TenantPhoneNumberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_phone_numbers")
    .select("id, e164, label, is_primary, capabilities, routing_rule, status, released_at, created_at")
    .neq("status", "released")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    e164: row.e164,
    label: row.label,
    is_primary: row.is_primary,
    capabilities: row.capabilities,
    routing_rule: (row.routing_rule ?? { kind: "ring_all" }) as TenantPhoneNumberRow["routing_rule"],
    status: row.status as TenantPhoneNumberRow["status"],
    released_at: row.released_at,
    created_at: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Search (mirrors the onboarding search)
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  areaCode: z.string().trim().regex(/^\d{3}$/, "Area code must be 3 digits"),
});

export async function searchNumbers(input: {
  areaCode: string;
}): Promise<{ ok: true; numbers: AvailableNumber[] } | { ok: false; error: string }> {
  try {
    await requireOwnerOrAdmin();
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
// Add another (purchase, attach, insert as non-primary)
// ---------------------------------------------------------------------------

const addSchema = z.object({
  e164: z.string().trim().regex(/^\+1\d{10}$/, "Phone number must be E.164"),
  label: z.string().trim().min(1).max(50).default("Main"),
});

export type AddResult =
  | { ok: true; phone_number_id: string; e164: string }
  | { ok: false; error: string };

export async function addPhoneNumber(input: {
  e164: string;
  label?: string;
}): Promise<AddResult> {
  let purchasedTelnyxId: string | null = null;
  try {
    const { profile } = await requireOwnerOrAdmin();
    const parsed = addSchema.parse({
      e164: input.e164,
      label: input.label ?? "Main",
    });

    const admin = createAdminClient();

    // Ensure tenant has a Credentials Connection (required by the softphone).
    // Idempotent — returns existing id if one is set, else creates one.
    const { data: tenantInfo, error: tenantInfoErr } = await admin
      .from("tenants")
      .select("slug")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantInfoErr || !tenantInfo) {
      return { ok: false, error: "Tenant lookup failed" };
    }
    const connectionId = await ensureTenantTelnyxConnection({
      admin,
      tenantId: profile.tenant_id,
      tenantSlug: tenantInfo.slug,
    });

    const purchased = await purchaseNumber({
      e164: parsed.e164,
      connectionId,
    });
    purchasedTelnyxId = purchased.telnyx_number_id;

    // Decide is_primary: true only if this is the first active number.
    const { count } = await admin
      .from("tenant_phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "active");
    const isFirst = (count ?? 0) === 0;

    const { data: row, error: insertErr } = await admin
      .from("tenant_phone_numbers")
      .insert({
        tenant_id: profile.tenant_id,
        telnyx_number_id: purchased.telnyx_number_id,
        e164: purchased.e164,
        capabilities: purchased.capabilities,
        messaging_profile_id: purchased.messaging_profile_id,
        voice_app_id: purchased.voice_app_id,
        label: parsed.label,
        is_primary: isFirst,
        status: "active",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      await safeReleaseNumber(purchasedTelnyxId, insertErr?.message);
      return {
        ok: false,
        error: `Number purchased but database write failed (${insertErr?.message ?? "unknown"}). Release attempted.`,
      };
    }

    revalidatePath("/admin/settings/phone-numbers");
    revalidatePath("/onboarding");
    return { ok: true, phone_number_id: row.id, e164: purchased.e164 };
  } catch (err) {
    if (purchasedTelnyxId) await safeReleaseNumber(purchasedTelnyxId, errorMessage(err));
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Import an already-purchased number (rescue)
//
// Use this when a number was ordered on Telnyx but never written to
// tenant_phone_numbers (e.g. the post-order lookup 404'd, leaving an
// orphan we've already paid for). Takes just the E.164 — we resolve
// the global numeric Telnyx id ourselves via the owned-numbers list.
// ---------------------------------------------------------------------------

const importSchema = z.object({
  e164: z
    .string()
    .trim()
    .regex(/^\+1\d{10}$/, "Phone number must be E.164 (+1 followed by 10 digits)"),
  label: z.string().trim().min(1).max(50).default("Main"),
});

export async function importExistingPhoneNumber(input: {
  e164: string;
  label?: string;
}): Promise<AddResult> {
  try {
    const { profile } = await requireOwnerOrAdmin();
    const parsed = importSchema.parse({
      e164: input.e164,
      label: input.label ?? "Main",
    });

    const admin = createAdminClient();

    // Refuse if we already have this number attached anywhere.
    const { data: existing } = await admin
      .from("tenant_phone_numbers")
      .select("id, tenant_id, e164")
      .eq("e164", parsed.e164)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error: `${parsed.e164} is already attached to a tenant — nothing to import.`,
      };
    }

    // Look up the global phone-number record on Telnyx by E.164.
    const phoneRecord = await findPhoneNumberByE164(parsed.e164);
    if (!phoneRecord) {
      return {
        ok: false,
        error: `We don't have a number matching ${parsed.e164} in inventory. Please contact support to verify.`,
      };
    }

    const capabilities = (phoneRecord.features ?? [])
      .map((f) => f.name)
      .filter((n) => n === "voice" || n === "sms" || n === "mms");

    const { count } = await admin
      .from("tenant_phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "active");
    const isFirst = (count ?? 0) === 0;

    const { data: row, error: insertErr } = await admin
      .from("tenant_phone_numbers")
      .insert({
        tenant_id: profile.tenant_id,
        telnyx_number_id: phoneRecord.id,
        e164: phoneRecord.phone_number,
        capabilities,
        messaging_profile_id:
          phoneRecord.messaging_profile_id ??
          process.env.TELNYX_MESSAGING_PROFILE_ID ??
          null,
        voice_app_id: phoneRecord.connection_id ?? null,
        label: parsed.label,
        is_primary: isFirst,
        status: "active",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      return {
        ok: false,
        error: `Number located but database write failed: ${insertErr?.message ?? "unknown"}`,
      };
    }

    revalidatePath("/admin/settings/phone-numbers");
    revalidatePath("/onboarding");
    return { ok: true, phone_number_id: row.id, e164: phoneRecord.phone_number };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Update label
// ---------------------------------------------------------------------------

const labelSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(50),
});

export async function updateNumberLabel(input: {
  id: string;
  label: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile } = await requireOwnerOrAdmin();
    const parsed = labelSchema.parse(input);
    const admin = createAdminClient();
    const { error } = await admin
      .from("tenant_phone_numbers")
      .update({ label: parsed.label })
      .eq("id", parsed.id)
      .eq("tenant_id", profile.tenant_id);
    if (error) throw error;
    revalidatePath("/admin/settings/phone-numbers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Set primary (demote others)
// ---------------------------------------------------------------------------

export async function setPrimaryNumber(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile } = await requireOwnerOrAdmin();
    const id = z.string().uuid().parse(input.id);
    const admin = createAdminClient();

    // Demote any existing primary first to satisfy the partial unique index
    // (one primary per tenant among active rows). Two updates inside the
    // same request is fine — the index is partial so the no-primary state
    // between updates is allowed.
    const { error: demoteErr } = await admin
      .from("tenant_phone_numbers")
      .update({ is_primary: false })
      .eq("tenant_id", profile.tenant_id)
      .eq("is_primary", true)
      .eq("status", "active");
    if (demoteErr) throw demoteErr;

    const { error: promoteErr } = await admin
      .from("tenant_phone_numbers")
      .update({ is_primary: true })
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "active");
    if (promoteErr) throw promoteErr;

    revalidatePath("/admin/settings/phone-numbers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Routing rule
// ---------------------------------------------------------------------------

const routingSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ROUTING_KINDS),
  voicemail_after_seconds: z.number().int().min(5).max(120).optional(),
});

export async function updateRoutingRule(input: {
  id: string;
  kind: RoutingKind;
  voicemail_after_seconds?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile } = await requireOwnerOrAdmin();
    const parsed = routingSchema.parse(input);
    const admin = createAdminClient();
    const rule = {
      kind: parsed.kind,
      voicemail_after_seconds: parsed.voicemail_after_seconds ?? 25,
    };
    const { error } = await admin
      .from("tenant_phone_numbers")
      .update({ routing_rule: rule })
      .eq("id", parsed.id)
      .eq("tenant_id", profile.tenant_id);
    if (error) throw error;
    revalidatePath("/admin/settings/phone-numbers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Release (soft-delete + Telnyx release)
// ---------------------------------------------------------------------------

export async function releasePhoneNumber(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile } = await requireOwnerOrAdmin();
    const id = z.string().uuid().parse(input.id);
    const admin = createAdminClient();

    // Read the row first so we have telnyx_number_id and is_primary
    const { data: row, error: readErr } = await admin
      .from("tenant_phone_numbers")
      .select("id, telnyx_number_id, is_primary, status")
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id)
      .single();
    if (readErr || !row) throw readErr ?? new Error("Number not found");
    if (row.status === "released") {
      return { ok: false, error: "Number is already released" };
    }
    if (row.is_primary) {
      // Block releasing the primary unless it's the last number anyway —
      // forcing the user to pick a new primary first prevents accidental
      // gaps in caller-ID configuration.
      const { count } = await admin
        .from("tenant_phone_numbers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", profile.tenant_id)
        .eq("status", "active");
      if ((count ?? 0) > 1) {
        return {
          ok: false,
          error: "Set another number as primary before releasing this one.",
        };
      }
    }

    // Soft-delete in DB first, then release at Telnyx. If the Telnyx call
    // fails we leave the row in 'released' but flag it so the caller can
    // see the partial state. Idempotent retry is safe.
    const { error: updateErr } = await admin
      .from("tenant_phone_numbers")
      .update({
        status: "released",
        is_primary: false,
        released_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id);
    if (updateErr) throw updateErr;

    try {
      await releaseNumber(row.telnyx_number_id);
    } catch (releaseErr) {
      console.error(
        `[settings] Telnyx release failed for ${row.telnyx_number_id} (DB row ${id} is marked released). Manual cleanup needed.`,
        releaseErr,
      );
      revalidatePath("/admin/settings/phone-numbers");
      return {
        ok: false,
        error:
          "Marked released in database but Telnyx release failed. The number may still bill — contact support.",
      };
    }

    revalidatePath("/admin/settings/phone-numbers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function safeReleaseNumber(telnyxNumberId: string, originalError?: string) {
  try {
    await releaseNumber(telnyxNumberId);
    console.error(
      `[settings] Released orphan Telnyx number ${telnyxNumberId} after DB failure: ${originalError ?? "n/a"}`,
    );
  } catch (releaseErr) {
    console.error(
      `[settings] CRITICAL: orphan Telnyx number ${telnyxNumberId} could not be released. ` +
        `Original DB error: ${originalError}. Release error: ${errorMessage(releaseErr)}`,
    );
  }
}
