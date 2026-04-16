import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listAppointments,
  getAppointmentStats,
} from "@/lib/queries/appointments";

import { AppointmentStats } from "./appointment-stats";
import { AppointmentTable } from "./appointment-table";
import { AppointmentFilters } from "./appointment-filters";

export const metadata = {
  title: "Appointments — Roof-Aid CRM",
};

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    time?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const scope = user.role === "rufero" ? { assignedTo: user.id } : {};

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const timeRange =
    (params.time as "upcoming" | "past" | "today" | "all") || "upcoming";

  const [result, stats] = await Promise.all([
    listAppointments({
      status: params.status,
      timeRange,
      assignedTo: scope.assignedTo,
      page,
    }),
    getAppointmentStats(scope),
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

      <AppointmentFilters />

      <AppointmentTable
        appointments={result.appointments}
        total={result.total}
        currentPage={page}
        pageSize={result.pageSize}
      />
    </div>
  );
}
