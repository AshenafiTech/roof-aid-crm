import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
  applyAntiCollisionRotation,
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
  });

  const [{ rows, total }, cities, states] = await Promise.all([
    listProspects(filters),
    listCities(),
    listStates(),
  ]);

  const rotatedRows = applyAntiCollisionRotation(rows);

  const notesMap = await fetchNotesByProspectId(
    rotatedRows.map((r) => r.id),
  );
  const notesByProspectId = Object.fromEntries(notesMap);

  return (
    <ProspectListView
      rows={rotatedRows}
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
