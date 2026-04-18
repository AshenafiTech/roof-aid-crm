import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPipelineCounts } from "@/lib/queries/dashboard";
import {
  getCloseRate,
  getCumulativeSalesThisMonth,
  getDealsLeaderboard,
  getRecentDeals,
  getRevenueBuckets,
  getRiskCounts,
} from "@/lib/queries/dashboard-metrics";

import { CloseRateGauge } from "./close-rate-gauge";
import { CumulativeSalesChart } from "./cumulative-sales-chart";
import { DashboardRealtime } from "./dashboard-realtime";
import { DealsLeaderboard } from "./deals-leaderboard";
import { PipelineFunnel } from "./pipeline-funnel";
import { RecentDeals } from "./recent-deals";
import { RevenueHero, ClosedWonCard } from "./revenue-hero";
import { SdrActivityChart } from "./sdr-activity-chart";

export const metadata = {
  title: "Dashboard — Roof-Aid CRM",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = user.role === "rufero" ? { assignedTo: user.id } : {};

  const [
    pipeline,
    revenue,
    salesSeries,
    recentDeals,
    leaderboard,
    closeRate,
    risk,
  ] = await Promise.all([
    getPipelineCounts(scope),
    getRevenueBuckets(scope),
    getCumulativeSalesThisMonth(scope),
    getRecentDeals(8, scope),
    getDealsLeaderboard(scope),
    getCloseRate(scope),
    getRiskCounts(scope),
  ]);

  const greeting = user.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            Revenue, pipeline, and team activity at a glance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      {/* Top row: revenue hero + closed/won, pipeline funnel, cumulative sales chart */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <RevenueHero revenue={revenue} />
          <ClosedWonCard revenue={revenue} />
        </div>
        <div className="lg:col-span-3">
          <PipelineFunnel pipeline={pipeline} />
        </div>
        <div className="lg:col-span-6">
          <div className="h-[340px] lg:h-full">
            <CumulativeSalesChart data={salesSeries} />
          </div>
        </div>
      </div>

      {/* Bottom row: recent deals, leaderboard, close-rate gauge + risk, SDR activity */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="min-h-[280px]">
          <RecentDeals deals={recentDeals} />
        </div>
        <div className="min-h-[280px]">
          <DealsLeaderboard rows={leaderboard} />
        </div>
        <div className="min-h-[280px]">
          <CloseRateGauge rate={closeRate} risk={risk} />
        </div>
        <div className="min-h-[280px]">
          <SdrActivityChart rows={leaderboard} />
        </div>
      </div>

      <DashboardRealtime tenantId={user.tenantId} userId={user.id} />
    </div>
  );
}
