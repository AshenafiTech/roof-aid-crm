import { PageHeader } from "@/components/shared/page-header";
import { PhoneDialer } from "./phone-dialer";

export const metadata = {
  title: "Phone — Roof-Aid CRM",
};

export default function PhonePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Phone"
        description="Make outbound calls to prospects and leads."
      />
      <PhoneDialer />
    </div>
  );
}
