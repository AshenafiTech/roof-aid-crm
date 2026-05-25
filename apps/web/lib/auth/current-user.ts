import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withRoles } from "@/lib/supabase/roles-augment";
import type { AuthUser, UserRole } from "@/lib/types/auth";

export const getCurrentUser = cache(async (): Promise<AuthUser> => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select(
      "id, tenant_id, role, email, first_name, last_name, phone, is_active",
    )
    .eq("id", authUser.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // `role_id` lives on the users table but isn't yet in database.types.ts
  // (added by migration 038). Fetch via the extended-types wrapper.
  const ext = withRoles(supabase);
  const { data: roleLink } = await ext
    .from("users")
    .select("role_id" as never)
    .eq("id", authUser.id)
    .single<{ role_id: string | null }>();

  const roleId = roleLink?.role_id ?? null;

  let isSuperRole = false;
  let privileges: string[] = [];

  if (roleId) {
    const { data: roleRow } = await ext
      .from("roles")
      .select(
        "id, slug, name, is_super_role, privileges_cache, login_web, login_mobile",
      )
      .eq("id", roleId)
      .single();
    if (roleRow) {
      isSuperRole = roleRow.is_super_role === true;
      privileges = roleRow.privileges_cache ?? [];
    }
  } else if (profile.role === "owner" || profile.role === "super_admin") {
    // Legacy fallback: while a user has no role_id yet (transition window),
    // owner / super_admin behave as super-roles via the legacy string column.
    isSuperRole = true;
  }

  return {
    id: profile.id,
    tenantId: profile.tenant_id,
    role: profile.role as UserRole,
    roleId,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    isActive: profile.is_active || false,
    privileges,
    isSuperRole,
  };
});
