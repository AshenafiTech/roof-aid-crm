import { createClient } from "@/lib/supabase/server";
import {
  PROSPECT_STATUSES,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";
import type { Database } from "@/lib/supabase/database.types";

export type PipelineCount = { status: ProspectStatus; count: number };

export type RecentActivityItem =
  Database["public"]["Tables"]["activities"]["Row"] & {
    user: { first_name: string | null; last_name: string | null } | null;
    prospect: { id: string; name: string } | null;
  };

type Scope = { assignedTo?: string };

export async function getPipelineCounts(
  scope: Scope = {},
): Promise<PipelineCount[]> {
  const supabase = await createClient();

  const results = await Promise.all(
    PROSPECT_STATUSES.map(async (status) => {
      let query = supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (scope.assignedTo) {
        query = query.eq("assigned_to", scope.assignedTo);
      }
      const { count, error } = await query;
      if (error) throw error;
      return { status, count: count ?? 0 };
    }),
  );

  return results;
}

export async function getTodayAppointmentsCount(
  scope: Scope = {},
): Promise<number> {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  let query = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("scheduled_at", startOfDay.toISOString())
    .lte("scheduled_at", endOfDay.toISOString())
    .in("status", ["scheduled", "confirmed"]);
  if (scope.assignedTo) {
    query = query.eq("rufero_id", scope.assignedTo);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function getRecentActivity(
  limit = 10,
  scope: Scope = {},
): Promise<RecentActivityItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("activities")
    .select(
      "*, user:users!user_id(first_name, last_name), prospect:prospects!prospect_id(id, name, assigned_to)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<
    RecentActivityItem & { prospect: (RecentActivityItem["prospect"] & { assigned_to?: string | null }) | null }
  >;

  const filtered = scope.assignedTo
    ? rows.filter((r) => r.prospect?.assigned_to === scope.assignedTo)
    : rows;

  return filtered.map((r) => ({
    ...r,
    prospect: r.prospect
      ? { id: r.prospect.id, name: r.prospect.name }
      : null,
  }));
}
