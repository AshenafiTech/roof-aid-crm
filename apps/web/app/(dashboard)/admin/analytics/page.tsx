import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getPipelineCounts,
  getRecentActivity,
  getTodayAppointmentsCount,
  getUnreadNotificationCount,
} from "@/lib/queries/dashboard";
import {
  getTeamPerformance,
  getConversionMetrics,
} from "@/lib/queries/analytics";

import { MetricsCards } from "../../metrics-cards";
import { PipelineBreakdown } from "../../pipeline-breakdown";
import { RecentActivity } from "../../recent-activity";
import { TeamPerformance } from "./team-performance";
import { ConversionFunnel } from "./conversion-funnel";

export const metadata = {
  title: "Analytics — Roof-Aid CRM",
};

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();

  if (user.role !== "owner" && user.role !== "admin" && user.role !== "super_admin") {
    redirect("/dashboard");
  }

  const [pipeline, todayAppts, unread, activity, team, conversion] =
    await Promise.all([
      getPipelineCounts(),
      getTodayAppointmentsCount(),
      getUnreadNotificationCount(user.id),
      getRecentActivity(15),
      getTeamPerformance(),
      getConversionMetrics(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline performance, team activity, and conversion metrics.
        </p>
      </div>

      <MetricsCards
        pipeline={pipeline}
        todayAppointments={todayAppts}
        unreadNotifications={unread}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineBreakdown pipeline={pipeline} />
        <ConversionFunnel conversion={conversion} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TeamPerformance team={team} />
        <RecentActivity items={activity} />
      </div>
    </div>
  );
}
