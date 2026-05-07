import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/auth";

/**
 * Renders an amber banner across every dashboard page when the tenant has
 * zero active phone numbers. Without one, calls and SMS can't go out, and
 * inbound traffic has nowhere to land.
 *
 * Owners/admins get a CTA into either onboarding (no number ever set up)
 * or the settings page (added one before, released them all). Other roles
 * see the banner in read-only form so they know the gap exists but can't
 * act on it.
 */
export async function MissingNumberBanner({
  tenantId,
  role,
}: {
  tenantId: string;
  role: UserRole;
}) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tenant_phone_numbers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  // On error, fail open — don't block the dashboard with an alarming banner
  // if the count query itself broke.
  if (error || (count ?? 0) > 0) return null;

  const canManage = role === "owner" || role === "admin" || role === "super_admin";
  const href = canManage ? "/onboarding" : null;

  return (
    <div
      data-banner="missing-number"
      className="border-b border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Your business line isn&apos;t set up yet
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-200">
            {canManage
              ? "Pick a phone number so homeowners can call and text you."
              : "An owner or admin needs to set up a phone number before calls and SMS can be made."}
          </p>
        </div>
        {href && (
          <Link
            href={href}
            className="self-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Set it up
          </Link>
        )}
      </div>
    </div>
  );
}
