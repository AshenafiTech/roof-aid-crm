import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getGmailConnection,
  getUnreadEmailCount,
  listEmailsAction,
} from "@/lib/email/actions";
import { getNotificationPreferences } from "@/lib/notifications/preferences";
import { Card } from "@/components/ui/card";
import { EmailWorkspace } from "./email-workspace";

export const metadata = {
  title: "Email — Roof-Aid CRM",
};

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user.role !== "telefonista" && user.role !== "owner") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Email"
          description="Send emails to prospects and leads."
        />
        <Card className="max-w-2xl p-6">
          <p className="text-sm text-muted-foreground">
            Email is only available for telefonista and owner users.
          </p>
        </Card>
      </div>
    );
  }

  const [connection, preferences] = await Promise.all([
    getGmailConnection(),
    getNotificationPreferences(),
  ]);

  let initialInbox = null;
  let initialUnread = 0;
  if (connection.connected) {
    const [inboxRes, unread] = await Promise.all([
      listEmailsAction({ folder: "INBOX" }),
      getUnreadEmailCount(),
    ]);
    initialUnread = unread;
    if (inboxRes.ok) {
      initialInbox = {
        messages: inboxRes.data.messages,
        nextPageToken: inboxRes.data.nextPageToken,
      };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="Send and read email from your connected Gmail account."
      />
      <EmailWorkspace
        initialConnection={connection}
        initialFlash={{
          connected: params.gmail_connected === "1",
          error: params.gmail_error ?? null,
        }}
        initialInbox={initialInbox}
        initialUnread={initialUnread}
        emailNotificationsEnabled={preferences.emailNewMessage}
      />
    </div>
  );
}
