import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listSmsLogs } from "@/lib/queries/comms";

import { SmsComposer } from "./sms-composer";
import { SmsLogsList } from "./sms-logs-list";

export const metadata = {
  title: "SMS — Roof-Aid CRM",
};

export default async function SmsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const user = await getCurrentUser();
  const result = await listSmsLogs(user.tenantId, { page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS"
        description="Send text messages to prospects and leads."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <SmsComposer />
        <SmsLogsList
          initialLogs={result.logs}
          tenantId={user.tenantId}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
        />
      </div>
    </div>
  );
}
