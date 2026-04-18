import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listNotifications } from "@/lib/queries/notifications";
import { getUnreadNotificationCount } from "@/lib/queries/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

import { NotificationList } from "./notification-list";
import { NotificationFilters } from "./notification-filters";

export const metadata = {
  title: "Notifications — Roof-Aid CRM",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    unread?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [result, unreadCount] = await Promise.all([
    listNotifications(user.id, {
      page,
      type: params.type,
      unreadOnly: params.unread === "1",
    }),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Stay updated on assignments, communications, and system events."
      />

      <Suspense
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        }
      >
        <NotificationFilters />
        <NotificationList
          notifications={result.notifications}
          total={result.total}
          currentPage={page}
          pageSize={result.pageSize}
          unreadCount={unreadCount}
        />
      </Suspense>
    </div>
  );
}
