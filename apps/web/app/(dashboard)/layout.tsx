import { UserProvider } from "@/components/providers/user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUnreadNotificationCount } from "@/lib/queries/dashboard";
import { getRecentNotifications } from "@/lib/queries/notifications";

import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getCurrentUser is cached — the page component's call is free.
  // Fetch user + notifications in parallel where possible.
  const user = await getCurrentUser();

  // These run in parallel
  const [unreadCount, recentNotifications] = await Promise.all([
    getUnreadNotificationCount(user.id),
    getRecentNotifications(user.id, 5),
  ]);

  return (
    <UserProvider user={user}>
      <DashboardShell
        user={user}
        unreadCount={unreadCount}
        recentNotifications={recentNotifications}
      >
        {children}
      </DashboardShell>
    </UserProvider>
  );
}
