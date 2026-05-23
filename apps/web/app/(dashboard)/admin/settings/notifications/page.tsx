import { PageHeader } from "@/components/shared/page-header";
import { getNotificationPreferences } from "@/lib/notifications/preferences";

import { NotificationsForm } from "./notifications-form";

export const metadata = {
  title: "Notifications — Roof-Aid CRM",
};

export default async function NotificationsSettingsPage() {
  const preferences = await getNotificationPreferences();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Choose when Roof-Aid should send you push notifications in this browser."
      />
      <NotificationsForm initialPreferences={preferences} />
    </div>
  );
}
