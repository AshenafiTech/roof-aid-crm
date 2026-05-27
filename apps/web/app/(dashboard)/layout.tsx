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

  // These run in parallel. Each fetch is wrapped so a single transient
  // failure on a side-bar widget (notifications, unread email count) does
  // NOT take down the entire dashboard layout. Without this, any of these
  // throwing causes Next.js to fall back to an error boundary — which the
  // customer perceives as "the whole app is broken" even though only a
  // counter failed to load. Log and degrade to a sane default.
  const [unreadCount, recentNotifications, emailUnreadCount] = await Promise.all([
    getUnreadNotificationCount(user.id).catch((err) => {
      console.error("[dashboard-layout] unread-count failed", {
        user_id: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }),
    getRecentNotifications(user.id, 5).catch((err) => {
      console.error("[dashboard-layout] recent-notifications failed", {
        user_id: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }),
    showEmailNav
      ? getUnreadEmailCount().catch((err) => {
          console.error("[dashboard-layout] email-unread-count failed", {
            user_id: user.id,
            error: err instanceof Error ? err.message : String(err),
          });
          return 0;
        })
      : Promise.resolve(0),
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
