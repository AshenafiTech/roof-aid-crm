import { createClient } from "@/lib/supabase/server";

export type NoteSummary = {
  body: string;
  created_at: string;
  author_name: string | null;
};

// Returns every note per prospect for the given ids, sorted newest-first.
// Used by the list pages to surface a prospect's full note history inline
// (most relevant on /follow-up, but useful everywhere we want context
// without the user having to leave the list).
export async function fetchNotesByProspectId(
  prospectIds: string[],
): Promise<Map<string, NoteSummary[]>> {
  if (prospectIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select(
      "prospect_id, body, created_at, author:users!author_id(first_name, last_name)",
    )
    .in("prospect_id", prospectIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const out = new Map<string, NoteSummary[]>();
  for (const row of data ?? []) {
    if (!row.prospect_id) continue;
    const author = row.author as
      | { first_name: string | null; last_name: string | null }
      | null;
    const author_name = author
      ? [author.first_name, author.last_name].filter(Boolean).join(" ") || null
      : null;
    const summary: NoteSummary = {
      body: row.body ?? "",
      created_at: row.created_at ?? "",
      author_name,
    };
    const list = out.get(row.prospect_id);
    if (list) list.push(summary);
    else out.set(row.prospect_id, [summary]);
  }
  return out;
}
