import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
} from "@/lib/queries/prospects";
import {
  parseProspectListFilters,
  PROSPECT_LIST_PAGE_SIZE,
  type ProspectListSearchParams,
} from "@/lib/queries/parse-list-params";
import { fetchNotesByProspectId } from "@/lib/queries/follow-up-notes";

export const metadata = {
  title: "Follow Up — Roof-Aid CRM",
};

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<ProspectListSearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters = parseProspectListFilters(params, {
    status: "follow_up",
    ignoreUrlStatus: true,
    assignedTo: user.role === "rufero" ? user.id : undefined,
    // Most recently changed first → newly-added follow-ups land at the top.
    // No anti-collision rotation here: ordering must stay stable across reloads
    // so reps don't lose their place between visits.
    sort: "updated_desc",
  });

  const [{ rows, total }, cities, states] = await Promise.all([
    listProspects(filters),
    listCities(),
    listStates(),
  ]);

  const notesMap = await fetchNotesByProspectId(rows.map((r) => r.id));
  const notesByProspectId = Object.fromEntries(notesMap);

  return (
    <ProspectListView
      rows={rows}
      total={total}
      cities={cities}
      states={states}
      pageSize={PROSPECT_LIST_PAGE_SIZE}
      basePath="/follow-up"
      statusFilter="follow_up"
      showStatusFilter={false}
      notesByProspectId={notesByProspectId}
    />
  );
}
