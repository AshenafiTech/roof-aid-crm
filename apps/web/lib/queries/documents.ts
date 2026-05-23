import { createClient } from "@/lib/supabase/server";

export type DocumentListItem = {
  id: string;
  type: string;
  status: string | null;
  storage_path: string | null;
  signed_storage_path: string | null;
  signed_at: string | null;
  page_count: number | null;
  sha256: string | null;
  signed_sha256: string | null;
  created_at: string | null;
  prospect: {
    id: string;
    name: string;
    city: string | null;
  } | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export type DocumentFilters = {
  prospectId?: string;
  status?: string;
  type?: string;
  q?: string;
  /** Inclusive lower bound on signed_at (YYYY-MM-DD or full ISO). */
  signedFrom?: string;
  /** Inclusive upper bound on signed_at (YYYY-MM-DD or full ISO). */
  signedTo?: string;
  page?: number;
  pageSize?: number;
};

const PAGE_SIZE = 25;

const SELECT_COLUMNS =
  "id, type, status, storage_path, signed_storage_path, signed_at, page_count, sha256, signed_sha256, created_at, prospect:prospects!prospect_id(id, name, city), created_by_user:users!created_by(first_name, last_name)";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
}

export async function listDocuments(filters: DocumentFilters = {}) {
  const supabase = await createClient();
  const size = filters.pageSize ?? PAGE_SIZE;
  const page = filters.page ?? 1;
  const from = (page - 1) * size;
  const to = from + size - 1;

  // If a free-text search is present, first resolve matching prospects so
  // we can constrain the documents query by prospect_id. Cheaper than a
  // foreign-table OR and keeps pagination correct on the documents side.
  let prospectIdFilter: string[] | null = null;
  if (filters.q?.trim()) {
    const term = `%${escapeIlike(filters.q.trim())}%`;
    const { data: matched, error: pErr } = await supabase
      .from("prospects")
      .select("id")
      .or(`name.ilike.${term},city.ilike.${term},address.ilike.${term}`)
      .limit(500);
    if (pErr) throw pErr;
    prospectIdFilter = (matched ?? []).map((r) => r.id as string);
    if (prospectIdFilter.length === 0) {
      return { documents: [], total: 0, pageSize: size };
    }
  }

  let query = supabase
    .from("documents")
    .select(SELECT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.prospectId) query = query.eq("prospect_id", filters.prospectId);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.type && filters.type !== "all") {
    query = query.eq("type", filters.type);
  }
  if (prospectIdFilter) {
    query = query.in("prospect_id", prospectIdFilter);
  }
  if (filters.signedFrom) {
    // Treat date-only inputs as the start of that local day in UTC.
    const from =
      filters.signedFrom.length === 10
        ? `${filters.signedFrom}T00:00:00.000Z`
        : filters.signedFrom;
    query = query.gte("signed_at", from);
  }
  if (filters.signedTo) {
    const to =
      filters.signedTo.length === 10
        ? `${filters.signedTo}T23:59:59.999Z`
        : filters.signedTo;
    query = query.lte("signed_at", to);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    documents: (data ?? []) as unknown as DocumentListItem[],
    total: count ?? 0,
    pageSize: size,
  };
}

export async function listDocumentsForProspect(prospectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(SELECT_COLUMNS)
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DocumentListItem[];
}
