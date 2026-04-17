import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Communications — Roof-Aid CRM",
};

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Communications"
        description="Coming in Milestone 4 — softphone, SMS inbox, and email."
      />
    </div>
  );
}
