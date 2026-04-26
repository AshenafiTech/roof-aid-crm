import { createClient } from "@/lib/supabase/server";

export type FollowUpNoteSummary = {
  body: string;
  created_at: string;
  author_name: string | null;
};

// Returns the most recent note per prospect for the given ids.
// Used by the /follow-up page to surface "why is this prospect in follow-up"
// inline on the list. The latest note is almost always the follow-up note;
// if a teammate later adds a regular note, the newer one shows — which is
// exactly the freshest context a rep wants.
export async function fetchLatestNotesByProspectId(
  prospectIds: string[],
): Promise<Map<string, FollowUpNoteSummary>> {
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

  const out = new Map<string, FollowUpNoteSummary>();
  for (const row of data ?? []) {
    if (!row.prospect_id || out.has(row.prospect_id)) continue;
    const author = row.author as
      | { first_name: string | null; last_name: string | null }
      | null;
    const author_name = author
      ? [author.first_name, author.last_name].filter(Boolean).join(" ") || null
      : null;
    out.set(row.prospect_id, {
      body: row.body ?? "",
      created_at: row.created_at ?? "",
      author_name,
    });
  }
  return out;
}
