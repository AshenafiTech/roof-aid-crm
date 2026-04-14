import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCities,
  listProspects,
  type ProspectFilters,
} from "@/lib/queries/prospects";
import { isProspectStatus } from "@/lib/constants/prospect-status";

import { Filters } from "./filters";
import { Pagination } from "./pagination";
import { ProspectTable } from "./prospect-table";
import { RealtimeRefresh } from "./realtime-refresh";
import { StatusLegend } from "./status-legend";

export const metadata = {
  title: "Prospects — Roof-Aid CRM",
};

const PAGE_SIZE = 60;

type SearchParams = {
  city?: string;
  status?: string;
  q?: string;
  page?: string;
};

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const parsedPage = Number(params.page);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const status = isProspectStatus(params.status) ? params.status : undefined;

  const filters: ProspectFilters = {
    city: params.city?.trim() || undefined,
    status,
    search: params.q?.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
    assignedTo: user.role === "rufero" ? user.id : undefined,
  };

  const [{ rows, total }, cities] = await Promise.all([
    listProspects(filters),
    listCities(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospects"
        description={`${total} total · page ${page} of ${totalPages}`}
      />
      <Filters cities={cities} />
      <StatusLegend />
      <ProspectTable rows={rows} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
      <RealtimeRefresh tenantId={user.tenantId} />
    </div>
  );
}
