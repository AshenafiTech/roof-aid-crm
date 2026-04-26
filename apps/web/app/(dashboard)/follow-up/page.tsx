import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
  applyAntiCollisionRotation,
  type ProspectFilters,
} from "@/lib/queries/prospects";

export const metadata = {
  title: "Follow Up — Roof-Aid CRM",
};

const PAGE_SIZE = 60;

type SearchParams = {
  city?: string;
  state?: string;
  q?: string;
  load?: string;
  priceMin?: string;
  priceMax?: string;
};

export default async function FollowUpPage({
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

  const filters: ProspectFilters = {
    city: params.city?.trim() || undefined,
    state: params.state?.trim() || undefined,
    status: "follow_up",
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
      basePath="/follow-up"
      statusFilter="follow_up"
      showStatusFilter={false}
    />
  );
}
