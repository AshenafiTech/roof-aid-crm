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
  state?: string;
  status?: ProspectStatus;
  /**
   * Statuses to exclude. Useful for the All Leads view where we want to
   * hide prospects that have been disqualified (e.g. `not_viable`) without
   * forcing a single positive status.
   */
  excludeStatuses?: ProspectStatus[];
  /** Free-text match against the prospect's NAME only. */
  search?: string;
  /** Free-text match against the prospect's ADDRESS only. */
  street?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  assignedTo?: string;
  priceMin?: number;
  priceMax?: number;
  page?: number;
  pageSize?: number;
  offset?: number;
  /**
   * Order for the result set.
   * - `"created_desc"` (default): newest prospects first.
   * - `"updated_desc"`: most recently changed prospects first. Useful on
   *   status pages (e.g. /follow-up) so a prospect that was just moved
   *   into the bucket lands at the top.
   */
  sort?: "created_desc" | "updated_desc";
};

// Escape PostgREST/SQL ilike wildcards so user input is treated as a literal substring.
function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
}

export async function listProspects(filters: ProspectFilters) {
  const supabase = await createClient();
  const size = filters.pageSize ?? 60;
  const from = filters.offset ?? 0;
  const to = from + size - 1;

  const sortColumn = filters.sort === "updated_desc" ? "updated_at" : "created_at";

  // Proximity search runs against the entire (RLS-scoped) prospects table via
  // an RPC, so the circle on the map matches every record in the tab — not
  // just the rows that happened to land in the current pagination window.
  // We collect the matching ids first and constrain the main query to them.
  let proximityIds: string[] | null = null;
  if (
    filters.lat != null &&
    filters.lng != null &&
    filters.radiusMiles != null &&
    Number.isFinite(filters.lat) &&
    Number.isFinite(filters.lng) &&
    filters.radiusMiles > 0
  ) {
    // The RPC isn't in the generated database.types yet; the migration
    // (023_search_prospects_proximity_miles.sql) defines it server-side.
    const { data: idRows, error: idErr } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { id: string }[] | null; error: unknown }>
    )("search_prospects_proximity_ids", {
      p_lat: filters.lat,
      p_lng: filters.lng,
      p_radius_miles: filters.radiusMiles,
    });
    if (idErr) throw idErr;
    proximityIds = (idRows ?? []).map((r) => r.id);
    if (proximityIds.length === 0) {
      return { rows: [], total: 0 };
    }
  }

  let query = supabase
    .from("prospects")
    .select(
      "*, assigned_user:users!assigned_to(id, first_name, last_name)",
      { count: "exact" },
    )
    .order(sortColumn, { ascending: false });

  if (proximityIds) {
    // Skip pagination for proximity searches — the user wants to see every
    // match in the radius on the map and the list, not the first 60.
    query = query.in("id", proximityIds);
  } else {
    query = query.range(from, to);
  }
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.excludeStatuses && filters.excludeStatuses.length > 0) {
    query = query.not(
      "status",
      "in",
      `(${filters.excludeStatuses.join(",")})`,
    );
  }

  // Separation of concerns:
  //   `search` → NAME only.   `street` → ADDRESS only.
  const nameTerm = filters.search?.trim();
  if (nameTerm) {
    query = query.ilike("name", `%${escapeIlike(nameTerm)}%`);
  }
  const streetTerm = filters.street?.trim();
  if (streetTerm) {
    query = query.ilike("address", `%${escapeIlike(streetTerm)}%`);
  }

  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.priceMin != null) query = query.gte("home_value", filters.priceMin);
  if (filters.priceMax != null) query = query.lte("home_value", filters.priceMax);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as unknown as ProspectListItem[],
    total: count ?? 0,
  };
}

export function applyAntiCollisionRotation<T>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const offset = new Date().getSeconds() % rows.length;
  return [...rows.slice(offset), ...rows.slice(0, offset)];
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

export async function listStates(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("state")
    .not("state", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.state) set.add(row.state);
  }
  return Array.from(set).sort();
}
