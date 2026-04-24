import { PageHeader } from "@/components/shared/page-header";
import { ProspectListView } from "@/components/shared/prospect-list-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listStates,
  listProspects,
  applyAntiCollisionRotation,
  type ProspectFilters,
} from "@/lib/queries/prospects";

import { RealtimeRefresh } from "./realtime-refresh";

export const metadata = {
  title: "Prospects — Roof-Aid CRM",
};

const PAGE_SIZE = 60;

type SearchParams = {
  city?: string;
  state?: string;
  status?: string;
  q?: string;
  street?: string;
  lat?: string;
  lng?: string;
  radiusKm?: string;
  load?: string;
  priceMin?: string;
  priceMax?: string;
};

export default async function ProspectsPage({
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

  const lat = params.lat ? Number(params.lat) : undefined;
  const lng = params.lng ? Number(params.lng) : undefined;
  const radiusKm = params.radiusKm ? Number(params.radiusKm) : undefined;

  const filters: ProspectFilters = {
    city: params.city?.trim() || undefined,
    state: params.state?.trim() || undefined,
    status: "prospects",
    search: params.q?.trim() || undefined,
    street: params.street?.trim() || undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    radiusKm: Number.isFinite(radiusKm) ? radiusKm : undefined,
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
    <>
      <ProspectListView
        rows={rotatedRows}
        total={total}
        cities={cities}
        states={states}
        pageSize={PAGE_SIZE}
        basePath="/prospects"
        statusFilter="prospects"
        showStatusFilter={false}
      />
      <RealtimeRefresh tenantId={user.tenantId} />
    </>
  );
}
