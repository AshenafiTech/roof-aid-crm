import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGmailConnection } from "@/lib/email/actions";
import { Card } from "@/components/ui/card";
import { EmailComposer } from "./email-composer";

export const metadata = {
  title: "Quick Email — Roof-Aid CRM",
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
          title="Quick Email"
          description="Send emails to prospects and leads."
        />
        <Card className="max-w-2xl p-6">
          <p className="text-sm text-muted-foreground">
            Email send is only available for telefonista and owner users.
          </p>
        </Card>
      </div>
    );
  }

  const connection = await getGmailConnection();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quick Email"
        description="Send emails to prospects and leads."
      />
      <EmailComposer
        initialConnection={connection}
        initialFlash={{
          connected: params.gmail_connected === "1",
          error: params.gmail_error ?? null,
        }}
      />
    </div>
  );
}
