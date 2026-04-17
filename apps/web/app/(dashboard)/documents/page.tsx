import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Documents — Roof-Aid CRM",
};

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Coming in Milestone 5 — contracts, e-signature, and storage."
      />
    </div>
  );
}
