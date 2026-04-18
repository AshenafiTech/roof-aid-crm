import { createClient } from "@/lib/supabase/server";

export type RevenueBucket = {
  todayRevenue: number;
  monthRevenue: number;
  quarterRevenue: number;
  yearRevenue: number;
  monthClosedCount: number;
  todayClosedCount: number;
  monthlyTarget: number;
};

export type DailySalesPoint = { day: string; amount: number };

export type RecentDeal = {
  id: string;
  name: string;
  city: string | null;
  closedAt: string;
  homeValue: number | null;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  role: string;
  closedCount: number;
  closedValue: number;
  appointmentsSet: number;
  callsToday: number;
};

export type CloseRate = {
  ratePct: number;
  scheduledCount: number;
  closedCount: number;
};

export type RiskCounts = {
  staleCount: number;
  noShowThisWeek: number;
  dncToday: number;
};

type Scope = { assignedTo?: string };

// Fallback monthly revenue target when tenant settings don't define one.
// TODO: read from tenants.settings.monthly_revenue_target when that field is wired.
const DEFAULT_MONTHLY_TARGET = 500_000;

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfQuarter(d = new Date()): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

function startOfYear(d = new Date()): Date {
  return new Date(d.getFullYear(), 0, 1);
}

type ClosedEventRow = {
  created_at: string;
  prospect: {
    id: string;
    name: string;
    city: string | null;
    home_value: number | null;
    assigned_to: string | null;
    status: string;
  } | null;
};

/**
 * Fetch status_change → closed_customer events since the given ISO timestamp,
 * joined to the prospect. A prospect may appear more than once if it was
 * closed → reopened → reclosed; the caller should keep the most recent event.
 */
async function fetchClosedEvents(
  sinceISO: string,
  scope: Scope,
): Promise<ClosedEventRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("activities")
    .select(
      "created_at, metadata, prospect:prospects!inner(id, name, city, home_value, assigned_to, status)",
    )
    .eq("type", "status_change")
    .filter("metadata->>to", "eq", "closed_customer")
    .eq("prospect.status", "closed_customer")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (scope.assignedTo) {
    q = q.eq("prospect.assigned_to", scope.assignedTo);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []) as unknown as ClosedEventRow[];
}

/** Deduplicate closed events so each prospect is counted at most once (most recent close). */
function dedupeByProspect(events: ClosedEventRow[]): ClosedEventRow[] {
  const seen = new Set<string>();
  const out: ClosedEventRow[] = [];
  for (const e of events) {
    if (!e.prospect?.id) continue;
    if (seen.has(e.prospect.id)) continue;
    seen.add(e.prospect.id);
    out.push(e);
  }
  return out;
}

export async function getRevenueBuckets(
  scope: Scope = {},
): Promise<RevenueBucket> {
  const now = new Date();
  const year = startOfYear(now);
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const quarter = startOfQuarter(now);

  const events = dedupeByProspect(
    await fetchClosedEvents(year.toISOString(), scope),
  );

  let todayRevenue = 0;
  let monthRevenue = 0;
  let quarterRevenue = 0;
  let yearRevenue = 0;
  let monthClosedCount = 0;
  let todayClosedCount = 0;

  for (const e of events) {
    const value = Number(e.prospect?.home_value ?? 0);
    const at = new Date(e.created_at);
    yearRevenue += value;
    if (at >= quarter) quarterRevenue += value;
    if (at >= month) {
      monthRevenue += value;
      monthClosedCount += 1;
    }
    if (at >= today) {
      todayRevenue += value;
      todayClosedCount += 1;
    }
  }

  return {
    todayRevenue,
    monthRevenue,
    quarterRevenue,
    yearRevenue,
    monthClosedCount,
    todayClosedCount,
    monthlyTarget: DEFAULT_MONTHLY_TARGET,
  };
}

export async function getCumulativeSalesThisMonth(
  scope: Scope = {},
): Promise<DailySalesPoint[]> {
  const now = new Date();
  const month = startOfMonth(now);

  const events = dedupeByProspect(
    await fetchClosedEvents(month.toISOString(), scope),
  );

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const perDay = new Array<number>(daysInMonth).fill(0);
  for (const e of events) {
    const d = new Date(e.created_at);
    const idx = d.getDate() - 1;
    if (idx >= 0 && idx < daysInMonth) {
      perDay[idx] += Number(e.prospect?.home_value ?? 0);
    }
  }

  return perDay.map((amount, i) => ({ day: String(i + 1), amount }));
}

export async function getRecentDeals(
  limit = 8,
  scope: Scope = {},
): Promise<RecentDeal[]> {
  const year = startOfYear(new Date());
  const events = dedupeByProspect(
    await fetchClosedEvents(year.toISOString(), scope),
  );

  return events.slice(0, limit).map((e) => ({
    id: e.prospect!.id,
    name: e.prospect!.name,
    city: e.prospect!.city,
    closedAt: e.created_at,
    homeValue: e.prospect!.home_value,
  }));
}

export async function getDealsLeaderboard(
  scope: Scope = {},
): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, first_name, last_name, role")
    .eq("is_active", true)
    .in("role", ["telefonista", "rufero", "admin"]);
  if (usersErr) throw usersErr;

  if (!users || users.length === 0) return [];

  const filteredUsers = scope.assignedTo
    ? users.filter((u) => u.id === scope.assignedTo)
    : users;
  const ids = filteredUsers.map((u) => u.id);
  const today = startOfDay();
  const month = startOfMonth();

  const [closedEvents, weekAppointments, todayCalls] = await Promise.all([
    fetchClosedEvents(month.toISOString(), scope),
    supabase
      .from("appointments")
      .select("rufero_id, created_by, created_at")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    supabase
      .from("call_logs")
      .select("agent_id")
      .eq("direction", "outbound")
      .gte("created_at", today.toISOString()),
  ]);

  if (weekAppointments.error) throw weekAppointments.error;
  if (todayCalls.error) throw todayCalls.error;

  const closedMap = new Map<string, { count: number; value: number }>();
  for (const e of dedupeByProspect(closedEvents)) {
    const who = e.prospect?.assigned_to;
    if (!who) continue;
    const cur = closedMap.get(who) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(e.prospect?.home_value ?? 0);
    closedMap.set(who, cur);
  }

  const appointmentsMap = new Map<string, number>();
  for (const r of weekAppointments.data ?? []) {
    const key = r.created_by ?? r.rufero_id;
    if (!key) continue;
    appointmentsMap.set(key, (appointmentsMap.get(key) ?? 0) + 1);
  }

  const callsMap = new Map<string, number>();
  for (const r of todayCalls.data ?? []) {
    if (!r.agent_id) continue;
    callsMap.set(r.agent_id, (callsMap.get(r.agent_id) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = filteredUsers
    .map((u) => ({
      userId: u.id,
      name:
        [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown",
      role: u.role,
      closedCount: closedMap.get(u.id)?.count ?? 0,
      closedValue: closedMap.get(u.id)?.value ?? 0,
      appointmentsSet: appointmentsMap.get(u.id) ?? 0,
      callsToday: callsMap.get(u.id) ?? 0,
    }))
    .filter((_r) => ids.includes(_r.userId))
    .sort(
      (a, b) => b.closedValue - a.closedValue || b.closedCount - a.closedCount,
    );

  return rows;
}

export async function getCloseRate(scope: Scope = {}): Promise<CloseRate> {
  const supabase = await createClient();

  let scheduledQ = supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled");
  let closedQ = supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("status", "closed_customer");

  if (scope.assignedTo) {
    scheduledQ = scheduledQ.eq("assigned_to", scope.assignedTo);
    closedQ = closedQ.eq("assigned_to", scope.assignedTo);
  }

  const [{ count: scheduled, error: e1 }, { count: closed, error: e2 }] =
    await Promise.all([scheduledQ, closedQ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const s = scheduled ?? 0;
  const c = closed ?? 0;
  const denom = s + c;
  return {
    scheduledCount: s,
    closedCount: c,
    ratePct: denom > 0 ? (c / denom) * 100 : 0,
  };
}

export async function getRiskCounts(scope: Scope = {}): Promise<RiskCounts> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const today = startOfDay().toISOString();

  let staleQ = supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .in("status", ["new_leads", "prospects"])
    .lt("updated_at", sevenDaysAgo);
  if (scope.assignedTo) staleQ = staleQ.eq("assigned_to", scope.assignedTo);

  const noShowQ = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "no-show")
    .gte("scheduled_at", sevenDaysAgo);

  let dncQ = supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("do_not_call", true)
    .gte("do_not_call_at", today);
  if (scope.assignedTo) dncQ = dncQ.eq("assigned_to", scope.assignedTo);

  const [stale, noShow, dnc] = await Promise.all([staleQ, noShowQ, dncQ]);
  if (stale.error) throw stale.error;
  if (noShow.error) throw noShow.error;
  if (dnc.error) throw dnc.error;

  return {
    staleCount: stale.count ?? 0,
    noShowThisWeek: noShow.count ?? 0,
    dncToday: dnc.count ?? 0,
  };
}
