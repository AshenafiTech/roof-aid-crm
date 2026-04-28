import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/current-user";
import { canAssignProspects } from "@/lib/auth/permissions";
import {
  listAppointments,
  listAppointmentsInRange,
  getAppointmentStats,
} from "@/lib/queries/appointments";

import { listRuferos } from "./actions";
import { AppointmentCalendar } from "./appointment-calendar";
import { AppointmentFilters } from "./appointment-filters";
import { AppointmentStats } from "./appointment-stats";
import { AppointmentTable } from "./appointment-table";

export const metadata = {
  title: "Appointments — Roof-Aid CRM",
};

type AppointmentsSearchParams = {
  status?: string;
  time?: string;
  rufero?: string;
  sort?: string;
  view?: string;
  month?: string;
  page?: string;
};

function parseMonth(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function calendarRange(monthStart: Date) {
  const start = new Date(monthStart);
  start.setDate(1 - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<AppointmentsSearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const isRufero = user.role === "rufero";
  const canAssign = canAssignProspects(user.role);
  const assignedScope = isRufero ? user.id : undefined;

  const cookieStore = await cookies();
  const persistedView = cookieStore.get("appt_view")?.value;
  const resolvedView =
    params.view === "calendar" || params.view === "list"
      ? params.view
      : persistedView === "calendar"
        ? "calendar"
        : "list";
  const view: "list" | "calendar" = resolvedView;
  const ruferoIdFilter = params.rufero || undefined;

  const sort =
    params.sort === "date_desc" || params.sort === "created_desc"
      ? params.sort
      : "date_asc";

  const [stats, ruferos] = await Promise.all([
    getAppointmentStats({ assignedTo: assignedScope }),
    canAssign ? listRuferos() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          Manage scheduled inspections and follow-ups.
        </p>
      </div>

      <AppointmentStats stats={stats} />

      <AppointmentFilters
        ruferos={ruferos}
        showRuferoFilter={canAssign}
        currentView={view}
      />

      {view === "calendar" ? (
        <CalendarView
          monthValue={params.month}
          status={params.status}
          assignedScope={assignedScope}
          ruferoIdFilter={ruferoIdFilter}
        />
      ) : (
        <ListView
          status={params.status}
          time={params.time}
          sort={sort}
          page={params.page}
          assignedScope={assignedScope}
          ruferoIdFilter={ruferoIdFilter}
          ruferos={ruferos}
          canAssign={canAssign}
        />
      )}
    </div>
  );
}

async function ListView({
  status,
  time,
  sort,
  page,
  assignedScope,
  ruferoIdFilter,
  ruferos,
  canAssign,
}: {
  status: string | undefined;
  time: string | undefined;
  sort: "date_asc" | "date_desc" | "created_desc";
  page: string | undefined;
  assignedScope: string | undefined;
  ruferoIdFilter: string | undefined;
  ruferos: Awaited<ReturnType<typeof listRuferos>>;
  canAssign: boolean;
}) {
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const timeRange =
    (time as "upcoming" | "past" | "today" | "all") || "upcoming";

  const result = await listAppointments({
    status,
    timeRange,
    assignedTo: assignedScope,
    ruferoId: ruferoIdFilter,
    sort,
    page: pageNum,
  });

  return (
    <AppointmentTable
      appointments={result.appointments}
      total={result.total}
      currentPage={pageNum}
      pageSize={result.pageSize}
      ruferos={ruferos}
      canAssign={canAssign}
    />
  );
}

async function CalendarView({
  monthValue,
  status,
  assignedScope,
  ruferoIdFilter,
}: {
  monthValue: string | undefined;
  status: string | undefined;
  assignedScope: string | undefined;
  ruferoIdFilter: string | undefined;
}) {
  const monthStart = parseMonth(monthValue);
  const { start, end } = calendarRange(monthStart);

  const appointments = await listAppointmentsInRange({
    start,
    end,
    status,
    assignedTo: assignedScope,
    ruferoId: ruferoIdFilter,
  });

  return <AppointmentCalendar appointments={appointments} />;
}
