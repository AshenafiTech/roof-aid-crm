import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege } from "@/lib/auth/privileges";

import { listRoles, listPrivileges } from "./actions";
import { RolesList } from "./roles-list";

export const metadata = {
  title: "Roles — Roof-Aid CRM",
};

export default async function RolesIndexPage() {
  const user = await getCurrentUser();
  if (!hasPrivilege(user, "manage_roles")) {
    redirect("/admin/settings");
  }

  const [roles, privileges] = await Promise.all([listRoles(), listPrivileges()]);
  const totalPrivileges = privileges.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Privileges"
        description="Define who can do what in your team. Edit the default roles or create custom ones to match how you work."
      />
      <RolesList initialRoles={roles} totalPrivileges={totalPrivileges} />
    </div>
  );
}
