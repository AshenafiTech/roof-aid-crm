import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Users — Roof-Aid CRM",
};

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Coming in Milestone 7 — invite, roles, extensions."
      />
    </div>
  );
}
