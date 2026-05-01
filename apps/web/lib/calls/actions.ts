"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type WarningKind = "dnc" | "outside_calling_hours";

export type CanCallResult =
  | { ok: true; warnings: WarningKind[] }
  | { ok: false; error: string };

const schema = z.object({ prospectId: z.string().uuid() });

/**
 * Pre-call gate. Mirrors the SMS pattern: hard blockers (no phone,
 * cross-tenant, not found) return `{ ok: false }`; soft-warnings (DNC,
 * outside calling hours) return `{ ok: true, warnings: [...] }` so the
 * client can prompt the user to confirm before dialing.
 */
export async function canCallProspect(input: {
  prospectId: string;
}): Promise<CanCallResult> {
  try {
    const { prospectId } = schema.parse(input);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Unauthorized" };

    const { data, error } = await supabase.rpc("can_call", {
      p_prospect_id: prospectId,
    });
    if (error) return { ok: false, error: error.message };

    const verdict = data as { allowed: boolean; reason: string };
    if (verdict.allowed) return { ok: true, warnings: [] };

    // Soft warnings — caller can override
    if (verdict.reason === "dnc") {
      return { ok: true, warnings: ["dnc"] };
    }
    if (verdict.reason === "outside_calling_hours") {
      return { ok: true, warnings: ["outside_calling_hours"] };
    }

    // Hard blocks
    return { ok: false, error: messageForReason(verdict.reason) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not check call permission",
    };
  }
}

function messageForReason(reason: string): string {
  switch (reason) {
    case "no_phone":
      return "Prospect has no phone number on file.";
    case "cross_tenant":
      return "This prospect belongs to a different tenant.";
    case "not_found":
      return "Prospect not found.";
    default:
      return `Cannot call: ${reason}`;
  }
}
