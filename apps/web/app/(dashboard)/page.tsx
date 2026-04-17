import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getPipelineCounts,
  getRecentActivity,
  getTodayAppointmentsCount,
  getUnreadNotificationCount,
} from "@/lib/queries/dashboard";
import { listAppointments } from "@/lib/queries/appointments";

import { DashboardRealtime } from "./dashboard-realtime";
import { MetricsCards } from "./metrics-cards";
import { PipelineBreakdown } from "./pipeline-breakdown";
import { RecentActivity } from "./recent-activity";
import { UpcomingAppointments } from "./upcoming-appointments";

export const metadata = {
  title: "Dashboard — Roof-Aid CRM",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = user.role === "rufero" ? { assignedTo: user.id } : {};

  const [pipeline, todayAppts, unread, activity, appointments] =
    await Promise.all([
      getPipelineCounts(scope),
      getTodayAppointmentsCount(scope),
      getUnreadNotificationCount(user.id),
      getRecentActivity(10, scope),
      listAppointments({
        timeRange: "upcoming",
        assignedTo: scope.assignedTo,
        pageSize: 5,
      }),
    ]);

  const greeting = user.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your pipeline today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/new-leads/import">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import Excel
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/new-leads">
              New Leads
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/prospects">
              Prospects
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <MetricsCards
        pipeline={pipeline}
        todayAppointments={todayAppts}
        unreadNotifications={unread}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineBreakdown pipeline={pipeline} />
        <UpcomingAppointments appointments={appointments.appointments} />
      </div>

      <RecentActivity items={activity} />

      <DashboardRealtime tenantId={user.tenantId} userId={user.id} />
    </div>
  );
}
