import { UserProvider } from "@/components/providers/user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUnreadNotificationCount } from "@/lib/queries/dashboard";

import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const unreadCount = await getUnreadNotificationCount(user.id);

  return (
    <UserProvider user={user}>
      <DashboardShell user={user} unreadCount={unreadCount}>
        {children}
      </DashboardShell>
    </UserProvider>
  );
}
