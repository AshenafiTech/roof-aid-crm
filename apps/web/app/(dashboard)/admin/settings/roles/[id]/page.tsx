import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege } from "@/lib/auth/privileges";

import { getRole, listPrivileges } from "../actions";
import { OWNER_ONLY_PRIVILEGE_LIST } from "../constants";
import { RoleEditor } from "./role-editor";

export const metadata = {
  title: "Edit Role — Roof-Aid CRM",
};

export default async function RoleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasPrivilege(user, "manage_roles")) {
    redirect("/admin/settings");
  }

  const { id } = await params;
  const [role, privileges] = await Promise.all([getRole(id), listPrivileges()]);
  if (!role) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/admin/settings/roles">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All roles
          </Link>
        </Button>
        <PageHeader
          title={role.is_super_role ? `${role.name} (Super Role)` : role.name}
          description={
            role.is_super_role
              ? "The Owner role has every privilege by definition. Its privilege set cannot be edited."
              : role.is_system
                ? "Default role bundled with every tenant. You can customize its privileges, but not its identity."
                : "Custom role. Edit identity and privileges."
          }
        />
      </div>

      <RoleEditor
        role={role}
        privileges={privileges}
        ownerOnlySlugs={OWNER_ONLY_PRIVILEGE_LIST}
      />
    </div>
  );
}
