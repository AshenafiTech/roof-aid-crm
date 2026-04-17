import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
    .select("id, tenant_id, role, email, first_name, last_name, phone, is_active")
    .eq("id", authUser.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return {
    id: profile.id,
    tenantId: profile.tenant_id,
    role: profile.role as UserRole,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    isActive: profile.is_active || false,
  };
});
