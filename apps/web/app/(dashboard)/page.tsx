import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getPipelineCounts,
  getRecentActivity,
  getTodayAppointmentsCount,
  getUnreadNotificationCount,
} from "@/lib/queries/dashboard";

import { DashboardRealtime } from "./dashboard-realtime";
import { MetricsCards } from "./metrics-cards";
import { PipelineBreakdown } from "./pipeline-breakdown";
import { RecentActivity } from "./recent-activity";

export const metadata = {
  title: "Dashboard — Roof-Aid CRM",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = user.role === "rufero" ? { assignedTo: user.id } : {};

  const [pipeline, todayAppts, unread, activity] = await Promise.all([
    getPipelineCounts(scope),
    getTodayAppointmentsCount(scope),
    getUnreadNotificationCount(user.id),
    getRecentActivity(10, scope),
  ]);

  const greeting = user.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting}
        description="Here's what's happening across your pipeline today."
      />
      <MetricsCards
        pipeline={pipeline}
        todayAppointments={todayAppts}
        unreadNotifications={unread}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineBreakdown pipeline={pipeline} />
        <RecentActivity items={activity} />
      </div>
      <DashboardRealtime tenantId={user.tenantId} userId={user.id} />
    </div>
  );
}
