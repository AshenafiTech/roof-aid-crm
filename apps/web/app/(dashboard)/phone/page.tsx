import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCallLogs } from "@/lib/queries/comms";

import { PhoneDialer } from "./phone-dialer";
import { CallLogsList } from "./call-logs-list";

export const metadata = {
  title: "Phone — Roof-Aid CRM",
};

export default async function PhonePage() {
  const user = await getCurrentUser();
  const result = await listCallLogs(user.tenantId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phone"
        description="Make outbound calls to prospects and leads."
      />
      <PhoneDialer />
      <CallLogsList
        initialLogs={result.logs}
        tenantId={user.tenantId}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
      />
    </div>
  );
}
