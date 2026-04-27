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
import { fetchLatestNotesByProspectId } from "@/lib/queries/follow-up-notes";

export const metadata = {
  title: "New Leads — Roof-Aid CRM",
};

export default async function NewLeadsPage({
  searchParams,
}: {
  searchParams: Promise<ProspectListSearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters = parseProspectListFilters(params, {
    status: "new_leads",
    ignoreUrlStatus: true,
    assignedTo: user.role === "rufero" ? user.id : undefined,
  });

  const [{ rows, total }, cities, states] = await Promise.all([
    listProspects(filters),
    listCities(),
    listStates(),
  ]);

  const rotatedRows = applyAntiCollisionRotation(rows);

  const notesByProspectId = await fetchLatestNotesByProspectId(
    rotatedRows.map((r) => r.id),
  );
  const latestNotesByProspectId = Object.fromEntries(notesByProspectId);

  return (
    <ProspectListView
      rows={rotatedRows}
      total={total}
      cities={cities}
      states={states}
      pageSize={PROSPECT_LIST_PAGE_SIZE}
      basePath="/new-leads"
      statusFilter="new_leads"
      showStatusFilter={false}
      latestNotesByProspectId={latestNotesByProspectId}
    />
  );
}
