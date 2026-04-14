import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ProspectStatus } from "@/lib/constants/prospect-status";

export type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"];

export type ProspectListItem = ProspectRow & {
  assigned_user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export type ProspectFilters = {
  city?: string;
  status?: ProspectStatus;
  search?: string;
  assignedTo?: string;
  page?: number;
  pageSize?: number;
};

export async function listProspects(filters: ProspectFilters) {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const size = filters.pageSize ?? 60;
  const from = (page - 1) * size;
  const to = from + size - 1;

  let query = supabase
    .from("prospects")
    .select(
      "*, assigned_user:users!assigned_to(id, first_name, last_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.city) query = query.eq("city", filters.city);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as unknown as ProspectListItem[],
    total: count ?? 0,
    page,
    size,
  };
}

export async function listCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("city")
    .not("city", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.city) set.add(row.city);
  }
  return Array.from(set).sort();
}
