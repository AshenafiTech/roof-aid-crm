import { createClient } from "@/lib/supabase/server";

export type AppointmentListItem = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  prospect: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    phones: string[] | null;
  } | null;
  rufero: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  creator: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export type AppointmentFilters = {
  status?: string;
  timeRange?: "upcoming" | "past" | "today" | "all";
  assignedTo?: string;
  page?: number;
  pageSize?: number;
};

const PAGE_SIZE = 20;

export async function listAppointments(filters: AppointmentFilters = {}) {
  const supabase = await createClient();
  const size = filters.pageSize ?? PAGE_SIZE;
  const page = filters.page ?? 1;
  const from = (page - 1) * size;
  const to = from + size - 1;

  let query = supabase
    .from("appointments")
    .select(
      "id, scheduled_at, duration_minutes, status, notes, cancellation_reason, created_at, prospect:prospects!prospect_id(id, name, address, city, phones), rufero:users!rufero_id(id, first_name, last_name), creator:users!created_by(first_name, last_name)",
      { count: "exact" },
    )
    .order("scheduled_at", { ascending: true })
    .range(from, to);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.assignedTo) {
    query = query.eq("rufero_id", filters.assignedTo);
  }

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  if (filters.timeRange === "upcoming") {
    query = query.gte("scheduled_at", now.toISOString());
  } else if (filters.timeRange === "past") {
    query = query.lt("scheduled_at", now.toISOString());
    query = query.order("scheduled_at", { ascending: false });
  } else if (filters.timeRange === "today") {
    query = query
      .gte("scheduled_at", startOfToday.toISOString())
      .lte("scheduled_at", endOfToday.toISOString());
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    appointments: (data ?? []) as unknown as AppointmentListItem[],
    total: count ?? 0,
    pageSize: size,
  };
}

export async function getAppointmentStats(scope: { assignedTo?: string } = {}) {
  const supabase = await createClient();

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const baseQuery = () => {
    let q = supabase.from("appointments").select("id", { count: "exact", head: true });
    if (scope.assignedTo) q = q.eq("rufero_id", scope.assignedTo);
    return q;
  };

  const [todayResult, upcomingResult, pendingResult, completedResult] = await Promise.all([
    baseQuery()
      .gte("scheduled_at", startOfToday.toISOString())
      .lte("scheduled_at", endOfToday.toISOString())
      .in("status", ["scheduled", "confirmed", "pending"]),
    baseQuery()
      .gt("scheduled_at", endOfToday.toISOString())
      .in("status", ["scheduled", "confirmed", "pending"]),
    baseQuery()
      .in("status", ["pending"]),
    baseQuery()
      .eq("status", "completed"),
  ]);

  return {
    today: todayResult.count ?? 0,
    upcoming: upcomingResult.count ?? 0,
    pending: pendingResult.count ?? 0,
    completed: completedResult.count ?? 0,
  };
}
