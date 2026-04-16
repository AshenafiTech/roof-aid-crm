import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";

import { listTenantUsers } from "./actions";
import { UserManagement } from "./user-management";

export const metadata = {
  title: "Users — Roof-Aid CRM",
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (user.role !== "owner" && user.role !== "super_admin") {
    redirect("/");
  }

  const users = await listTenantUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite team members, manage roles, and control access."
      />
      <UserManagement initialUsers={users} />
    </div>
  );
}
