import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
  applyAntiCollisionRotation,
} from "@/lib/queries/prospects";
import { isProspectStatus } from "@/lib/constants/prospect-status";
import {
  parseProspectListFilters,
  PROSPECT_LIST_PAGE_SIZE,
  type ProspectListSearchParams,
} from "@/lib/queries/parse-list-params";

export const metadata = {
  title: "All Leads — Roof-Aid CRM",
};

export default async function AllLeadsPage({
  searchParams,
}: {
  searchParams: Promise<ProspectListSearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters = parseProspectListFilters(params, {
    assignedTo: user.role === "rufero" ? user.id : undefined,
  });

  const statusForView =
    params.status && isProspectStatus(params.status) ? params.status : undefined;

  const [{ rows, total }, cities, states] = await Promise.all([
    listProspects(filters),
    listCities(),
    listStates(),
  ]);

  const rotatedRows = applyAntiCollisionRotation(rows);

  return (
    <ProspectListView
      rows={rotatedRows}
      total={total}
      cities={cities}
      states={states}
      pageSize={PROSPECT_LIST_PAGE_SIZE}
      basePath="/all-leads"
      statusFilter={statusForView}
      showStatusFilter={true}
    />
  );
}
