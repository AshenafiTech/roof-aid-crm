"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  purchaseNumber,
  releaseNumberByE164,
  searchAvailableNumbers,
} from "@/lib/telnyx/client";
import { ensureTenantTelnyxConnection } from "@/lib/telnyx/ensure-tenant-connection";
import { PartialPurchaseError, TelnyxError } from "@/lib/telnyx/errors";
import type { AvailableNumber } from "@/lib/telnyx/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Structured logging for the purchase+attach flow
// ---------------------------------------------------------------------------
//
// All log lines from a single purchase attempt share the same short trace id
// so you can correlate them in Vercel logs with one grep:
//
//   vercel logs --follow | grep '<traceId>'
//
// Lines are emitted at every phase boundary so a failure is always followed
// by enough context to triage without reproducing.

type LogLevel = "info" | "warn" | "error";

interface LogCtx {
  traceId: string;
  tenantId?: string | null;
  e164?: string | null;
}

function logPhase(
  level: LogLevel,
  ctx: LogCtx,
  phase: string,
  detail?: Record<string, unknown>,
): void {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  const base = `[onboarding:purchase] ${ctx.traceId} phase=${phase}`;
  const tenantPart = ctx.tenantId ? ` tenant=${ctx.tenantId}` : "";
  const e164Part = ctx.e164 ? ` e164=${ctx.e164}` : "";
  if (detail && Object.keys(detail).length > 0) {
    fn(`${base}${tenantPart}${e164Part}`, detail);
  } else {
    fn(`${base}${tenantPart}${e164Part}`);
  }
}

function newTraceId(): string {
  return randomBytes(4).toString("hex");
}

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
  const traceId = newTraceId();
  const startedAt = Date.now();
  // Atomicity contract: if `purchasedE164` is set, money has been committed
  // on Telnyx. From that point on, every code path MUST either flip
  // `attached = true` (DB row written) OR call `safeReleaseByE164` to give
  // the number back. The catch block at the bottom enforces this.
  let purchasedE164: string | null = null;
  let attached = false;
  // Hoisted so the catch block can run idempotent DB cleanup before the
  // release — defends against "INSERT committed but the API response was
  // lost" scenarios where a stale row would block a retry.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let profileTenantId: string | null = null;

  logPhase("info", { traceId, e164: input.e164 }, "start", {
    requested_e164: input.e164,
    label: input.label ?? "Main",
  });

  try {
    const { profile } = await requireTenantOwner();
    profileTenantId = profile.tenant_id;
    const userId = profile.id;
    logPhase("info", { traceId, tenantId: profileTenantId, e164: input.e164 }, "auth-ok", {
      role: profile.role,
      user_id: userId,
    });

    const parsed = purchaseSchema.parse({
      e164: input.e164,
      label: input.label ?? "Main",
    });

    // Service-role client to bypass RLS for the existing-primary check and
    // for the eventual INSERT — we already verified the caller is an owner.
    admin = createAdminClient();

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
      logPhase(
        "warn",
        { traceId, tenantId: profileTenantId, e164: parsed.e164 },
        "existing-primary-block",
        { existing_e164: existingPrimary.e164, existing_row_id: existingPrimary.id },
      );
      return {
        ok: false,
        error: `Tenant already has a primary number (${existingPrimary.e164}). Manage additional numbers from Settings.`,
      };
    }

    // 1. Ensure tenant has a Telnyx Credentials Connection. Required for
    //    the WebRTC softphone — without it, /api/telnyx/credentials rejects
    //    and reps can't make/receive calls. Idempotent: returns existing
    //    connection id if one is already set. Pre-purchase — no money at
    //    risk if this throws.
    const { data: tenantInfo, error: tenantInfoErr } = await admin
      .from("tenants")
      .select("slug")
      .eq("id", profileTenantId)
      .single();
    if (tenantInfoErr || !tenantInfo) {
      logPhase(
        "error",
        { traceId, tenantId: profileTenantId, e164: parsed.e164 },
        "tenant-lookup-failed",
        { db_error: tenantInfoErr?.message ?? "no row" },
      );
      return { ok: false, error: "Tenant lookup failed" };
    }
    const connectionId = await ensureTenantTelnyxConnection({
      admin,
      tenantId: profileTenantId,
      tenantSlug: tenantInfo.slug,
    });
    logPhase(
      "info",
      { traceId, tenantId: profileTenantId, e164: parsed.e164 },
      "connection-ready",
      { slug: tenantInfo.slug, connection_id: connectionId },
    );

    // 2. Purchase from Telnyx. From the moment this resolves successfully,
    //    money is committed and `purchasedE164` MUST be set so the catch
    //    block can release if anything later fails.
    logPhase(
      "info",
      { traceId, tenantId: profileTenantId, e164: parsed.e164 },
      "purchase-started",
    );
    const purchaseStartedAt = Date.now();
    const purchased = await purchaseNumber({
      e164: parsed.e164,
      connectionId,
    });
    purchasedE164 = purchased.e164;
    logPhase(
      "info",
      { traceId, tenantId: profileTenantId, e164: purchasedE164 },
      "purchase-ok",
      {
        purchase_ms: Date.now() - purchaseStartedAt,
        telnyx_number_id: purchased.telnyx_number_id,
        capabilities: purchased.capabilities,
      },
    );

    // 3. Insert tenant_phone_numbers row. If this fails for any reason
    //    (RLS, FK, unique constraint, network), we treat it the same as
    //    any other mid-flight failure: fall through to the catch block,
    //    which releases the just-purchased number.
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
      logPhase(
        "error",
        { traceId, tenantId: profileTenantId, e164: purchasedE164 },
        "insert-failed",
        {
          db_error: insertErr?.message ?? "no row returned",
          db_code: insertErr?.code ?? null,
          db_details: insertErr?.details ?? null,
        },
      );
      throw new Error(
        `tenant_phone_numbers insert failed: ${insertErr?.message ?? "unknown"}`,
      );
    }

    attached = true;
    logPhase(
      "info",
      { traceId, tenantId: profileTenantId, e164: purchasedE164 },
      "attached",
      { row_id: row.id, total_ms: Date.now() - startedAt },
    );

    revalidatePath("/onboarding");
    revalidatePath("/admin/settings/phone-numbers");

    return { ok: true, phone_number_id: row.id, e164: purchased.e164 };
  } catch (err) {
    // PartialPurchaseError means the order succeeded (or *may have* succeeded
    // in the polling-timeout case) but the post-order lookup never resolved.
    // Surface the e164 from the error so we can still release.
    if (err instanceof PartialPurchaseError && !purchasedE164) {
      purchasedE164 = err.e164;
      logPhase(
        "warn",
        { traceId, tenantId: profileTenantId, e164: purchasedE164 },
        "partial-purchase",
        { order_id: err.orderId, message: err.message },
      );
    }

    if (purchasedE164 && !attached) {
      logPhase(
        "warn",
        { traceId, tenantId: profileTenantId, e164: purchasedE164 },
        "rollback-started",
        { reason: errorMessage(err) },
      );

      // Idempotent DB cleanup BEFORE releasing the Telnyx number. Covers the
      // narrow case where the INSERT actually committed in Postgres but the
      // API response was lost — leaving a stale `tenant_phone_numbers` row
      // that would block any retry (existingPrimary check would trip). If
      // no such row exists, this is a no-op.
      if (admin && profileTenantId) {
        const { error: cleanupErr, count } = await admin
          .from("tenant_phone_numbers")
          .delete({ count: "exact" })
          .eq("tenant_id", profileTenantId)
          .eq("e164", purchasedE164)
          .eq("status", "active");
        if (cleanupErr) {
          logPhase(
            "error",
            { traceId, tenantId: profileTenantId, e164: purchasedE164 },
            "rollback-db-cleanup-failed",
            { db_error: cleanupErr.message, hint: "manual rescue likely required" },
          );
        } else {
          logPhase(
            "info",
            { traceId, tenantId: profileTenantId, e164: purchasedE164 },
            "rollback-db-cleaned",
            { rows_deleted: count ?? 0 },
          );
        }
      }

      await safeReleaseByE164(purchasedE164, errorMessage(err), {
        traceId,
        tenantId: profileTenantId,
      });

      return {
        ok: false,
        error:
          "We couldn't finish setting up that number. No charge was made — please try again or pick a different number.",
      };
    }

    // Failure before any money was committed.
    logPhase(
      "error",
      { traceId, tenantId: profileTenantId, e164: input.e164 },
      "failed-pre-purchase",
      { error: errorMessage(err), error_class: err instanceof Error ? err.constructor.name : typeof err },
    );
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Release a just-purchased number by its E.164. Used by `purchaseAndAttachNumber`
 * whenever the order succeeded but anything afterwards (DB write, post-order
 * lookup) failed. The retry inside `releaseNumberByE164` rides out Telnyx's
 * eventual-consistency window the same way the lookup-after-order does.
 *
 * Returning a paid number leaves a CRITICAL log on the rare double-failure
 * case (release fails OR number can't be located on Telnyx); the run-time
 * caller has already returned `ok: false`, so the customer is not billed
 * surprise dollars from the UI's perspective.
 */
async function safeReleaseByE164(
  e164: string,
  originalError: string,
  ctx: { traceId: string; tenantId: string | null },
) {
  const logCtx: LogCtx = { traceId: ctx.traceId, tenantId: ctx.tenantId, e164 };
  try {
    const released = await releaseNumberByE164(e164);
    if (released) {
      logPhase("warn", logCtx, "rollback-telnyx-released", {
        original_error: originalError,
      });
    } else {
      logPhase("error", logCtx, "rollback-orphan-critical", {
        reason: "Could not locate number on Telnyx to release",
        original_error: originalError,
        action_required:
          "Manual rescue: verify on Telnyx portal; if owned, use importExistingPhoneNumber or the manual SQL recipe.",
      });
    }
  } catch (releaseErr) {
    logPhase("error", logCtx, "rollback-orphan-critical", {
      reason: "Release attempt threw",
      original_error: originalError,
      release_error: errorMessage(releaseErr),
      action_required: "Manual rescue required — number is paid for with no DB row.",
    });
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
