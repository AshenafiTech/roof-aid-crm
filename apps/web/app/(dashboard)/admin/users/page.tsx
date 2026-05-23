import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege } from "@/lib/auth/privileges";

import { listTenantUsers } from "./actions";
import { UserManagement } from "./user-management";

export const metadata = {
  title: "Users — Roof-Aid CRM",
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (!hasPrivilege(user, "manage_users")) {
    redirect("/dashboard");
  }

  const users = await listTenantUsers();
  const canDelete = hasPrivilege(user, "delete_users");

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite team members, manage roles, and control access."
      />
      <UserManagement initialUsers={users} canDelete={canDelete} />
    </div>
  );
}
