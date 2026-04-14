import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Settings — Roof-Aid CRM",
};

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Coming in Milestone 7 — company profile, calling hours, templates."
      />
    </div>
  );
}
