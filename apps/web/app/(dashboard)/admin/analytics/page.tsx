import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Analytics — Roof-Aid CRM",
};

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Coming in Milestone 7 — pipeline funnel, agent leaderboard, conversion metrics."
      />
    </div>
  );
}
