import { UserProvider } from "@/components/providers/user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege } from "@/lib/auth/privileges";
import { getUnreadEmailCount } from "@/lib/email/actions";
import { getUnreadNotificationCount } from "@/lib/queries/dashboard";
import { getRecentNotifications } from "@/lib/queries/notifications";

import { DashboardShell } from "./dashboard-shell";
import { MissingNumberBanner } from "./missing-number-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getCurrentUser is cached — the page component's call is free.
  // Fetch user + notifications in parallel where possible.
  const user = await getCurrentUser();

  const showEmailNav = hasPrivilege(user, "send_email");

  // These run in parallel
  const [unreadCount, recentNotifications, emailUnreadCount] = await Promise.all([
    getUnreadNotificationCount(user.id),
    getRecentNotifications(user.id, 5),
    showEmailNav ? getUnreadEmailCount() : Promise.resolve(0),
  ]);

  return (
    <UserProvider user={user}>
      <DashboardShell
        user={user}
        unreadCount={unreadCount}
        recentNotifications={recentNotifications}
        emailUnreadCount={emailUnreadCount}
        banner={<MissingNumberBanner tenantId={user.tenantId} role={user.role} />}
      >
        {children}
      </DashboardShell>
    </UserProvider>
  );
}
