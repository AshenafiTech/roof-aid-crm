import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { UserProvider } from "@/components/providers/user-provider";
import type { AuthUser, UserRole } from "@/lib/types/auth";

import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Verify auth — middleware handles redirect, but this is a safety net
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // Fetch the full user profile from the users table
  const { data: profile } = await supabase
    .from("users")
    .select("id, tenant_id, role, email, first_name, last_name, phone, is_active")
    .eq("id", authUser.id)
    .single();

  // If no profile row exists (e.g. provisioning race condition), sign out
  if (!profile) {
    redirect("/login");
  }

  const user: AuthUser = {
    id: profile.id,
    tenantId: profile.tenant_id,
    role: profile.role as UserRole,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    isActive: profile.is_active || false,
  };

  return (
    <UserProvider user={user}>
      <DashboardShell user={user}>{children}</DashboardShell>
    </UserProvider>
  );
}
