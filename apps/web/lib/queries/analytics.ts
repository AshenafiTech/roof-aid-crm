import { createClient } from "@/lib/supabase/server";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  prospectCount: number;
  closedCount: number;
  activityCount: number;
};

export type ConversionMetrics = {
  totalProspects: number;
  contacted: number;
  scheduled: number;
  closed: number;
  contactRate: number;
  scheduleRate: number;
  closeRate: number;
  dncCount: number;
  notViableCount: number;
};

export async function getTeamPerformance(): Promise<TeamMember[]> {
  const supabase = await createClient();

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, first_name, last_name, role")
    .eq("is_active", true)
    .in("role", ["telefonista", "rufero", "admin"])
    .order("first_name");

  if (usersError) throw usersError;
  if (!users || users.length === 0) return [];

  const userIds = users.map((u) => u.id);

  // Count assigned prospects per user
  const { data: assignedCounts, error: assignedErr } = await supabase
    .from("prospects")
    .select("assigned_to")
    .in("assigned_to", userIds);
  if (assignedErr) throw assignedErr;

  // Count closed prospects per user
  const { data: closedCounts, error: closedErr } = await supabase
    .from("prospects")
    .select("assigned_to")
    .in("assigned_to", userIds)
    .eq("status", "closed_customer");
  if (closedErr) throw closedErr;

  // Count recent activities per user (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: activityCounts, error: activityErr } = await supabase
    .from("activities")
    .select("user_id")
    .in("user_id", userIds)
    .gte("created_at", thirtyDaysAgo.toISOString());
  if (activityErr) throw activityErr;

  // Build counts
  const assignedMap = new Map<string, number>();
  for (const r of assignedCounts ?? []) {
    if (r.assigned_to) {
      assignedMap.set(r.assigned_to, (assignedMap.get(r.assigned_to) ?? 0) + 1);
    }
  }
  const closedMap = new Map<string, number>();
  for (const r of closedCounts ?? []) {
    if (r.assigned_to) {
      closedMap.set(r.assigned_to, (closedMap.get(r.assigned_to) ?? 0) + 1);
    }
  }
  const activityMap = new Map<string, number>();
  for (const r of activityCounts ?? []) {
    if (r.user_id) {
      activityMap.set(r.user_id, (activityMap.get(r.user_id) ?? 0) + 1);
    }
  }

  return users.map((u) => ({
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown",
    role: u.role,
    prospectCount: assignedMap.get(u.id) ?? 0,
    closedCount: closedMap.get(u.id) ?? 0,
    activityCount: activityMap.get(u.id) ?? 0,
  }));
}

export async function getConversionMetrics(): Promise<ConversionMetrics> {
  const supabase = await createClient();

  const statuses = [
    "new_leads",
    "prospects",
    "contacted",
    "follow_up",
    "scheduled",
    "closed_customer",
    "not_viable",
  ] as const;

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw error;
      return { status, count: count ?? 0 };
    }),
  );

  const map = new Map(counts.map((c) => [c.status, c.count]));

  const totalProspects = counts.reduce((s, c) => s + c.count, 0);
  const contacted = map.get("contacted") ?? 0;
  const scheduled = map.get("scheduled") ?? 0;
  const closed = map.get("closed_customer") ?? 0;
  const notViable = map.get("not_viable") ?? 0;

  // Count DNC prospects
  const { count: dncCount, error: dncErr } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("do_not_call", true);
  if (dncErr) throw dncErr;

  return {
    totalProspects,
    contacted,
    scheduled,
    closed,
    contactRate: totalProspects > 0 ? (contacted / totalProspects) * 100 : 0,
    scheduleRate: contacted > 0 ? (scheduled / contacted) * 100 : 0,
    closeRate: scheduled > 0 ? (closed / scheduled) * 100 : 0,
    dncCount: dncCount ?? 0,
    notViableCount: notViable,
  };
}
