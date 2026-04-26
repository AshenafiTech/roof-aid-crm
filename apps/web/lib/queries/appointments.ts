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
  ruferoId?: string;
  sort?: "date_asc" | "date_desc" | "created_desc";
  page?: number;
  pageSize?: number;
};

const PAGE_SIZE = 20;

const SELECT_COLUMNS =
  "id, scheduled_at, duration_minutes, status, notes, cancellation_reason, created_at, prospect:prospects!prospect_id(id, name, address, city, phones), rufero:users!rufero_id(id, first_name, last_name), creator:users!created_by(first_name, last_name)";

export async function listAppointments(filters: AppointmentFilters = {}) {
  const supabase = await createClient();
  const size = filters.pageSize ?? PAGE_SIZE;
  const page = filters.page ?? 1;
  const from = (page - 1) * size;
  const to = from + size - 1;

  let query = supabase
    .from("appointments")
    .select(SELECT_COLUMNS, { count: "exact" })
    .range(from, to);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // Role-scoping (rufero can only see their own — set by caller).
  if (filters.assignedTo) {
    query = query.eq("rufero_id", filters.assignedTo);
  }

  if (filters.ruferoId) {
    query = query.eq("rufero_id", filters.ruferoId);
  }

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  let ascending = true;
  if (filters.timeRange === "upcoming") {
    query = query.gte("scheduled_at", now.toISOString());
    ascending = true;
  } else if (filters.timeRange === "past") {
    query = query.lt("scheduled_at", now.toISOString());
    ascending = false;
  } else if (filters.timeRange === "today") {
    query = query
      .gte("scheduled_at", startOfToday.toISOString())
      .lte("scheduled_at", endOfToday.toISOString());
    ascending = true;
  }

  // Sort override (UI control wins over time-range default).
  if (filters.sort === "date_asc") {
    query = query.order("scheduled_at", { ascending: true });
  } else if (filters.sort === "date_desc") {
    query = query.order("scheduled_at", { ascending: false });
  } else if (filters.sort === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("scheduled_at", { ascending });
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    appointments: (data ?? []) as unknown as AppointmentListItem[],
    total: count ?? 0,
    pageSize: size,
  };
}

export async function listAppointmentsInRange(params: {
  start: Date;
  end: Date;
  status?: string;
  assignedTo?: string;
  ruferoId?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("appointments")
    .select(SELECT_COLUMNS)
    .gte("scheduled_at", params.start.toISOString())
    .lte("scheduled_at", params.end.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1000);

  if (params.status) query = query.eq("status", params.status);
  if (params.assignedTo) query = query.eq("rufero_id", params.assignedTo);
  if (params.ruferoId) query = query.eq("rufero_id", params.ruferoId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AppointmentListItem[];
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
