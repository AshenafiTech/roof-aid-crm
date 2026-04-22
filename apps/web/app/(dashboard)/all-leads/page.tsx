import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
  applyAntiCollisionRotation,
  type ProspectFilters,
} from "@/lib/queries/prospects";
import { isProspectStatus } from "@/lib/constants/prospect-status";

export const metadata = {
  title: "All Leads — Roof-Aid CRM",
};

const PAGE_SIZE = 60;

type SearchParams = {
  city?: string;
  state?: string;
  status?: string;
  q?: string;
  load?: string;
  priceMin?: string;
  priceMax?: string;
};

export default async function AllLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const loadCount = Number(params.load);
  const effectiveSize =
    Number.isFinite(loadCount) && loadCount > PAGE_SIZE
      ? loadCount
      : PAGE_SIZE;

  const priceMin = params.priceMin ? Number(params.priceMin) : undefined;
  const priceMax = params.priceMax ? Number(params.priceMax) : undefined;

  const statusParam =
    params.status && isProspectStatus(params.status) ? params.status : undefined;

  const filters: ProspectFilters = {
    city: params.city?.trim() || undefined,
    state: params.state?.trim() || undefined,
    status: statusParam,
    search: params.q?.trim() || undefined,
    offset: 0,
    pageSize: effectiveSize,
    assignedTo: user.role === "rufero" ? user.id : undefined,
    priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
    priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
  };

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
      pageSize={PAGE_SIZE}
      basePath="/all-leads"
      statusFilter={statusParam}
      showStatusFilter={true}
    />
  );
}
