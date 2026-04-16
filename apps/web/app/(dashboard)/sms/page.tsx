import { PageHeader } from "@/components/shared/page-header";
import { SmsComposer } from "./sms-composer";

export const metadata = {
  title: "SMS — Roof-Aid CRM",
};

export default function SmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS"
        description="Send text messages to prospects and leads."
      />
      <SmsComposer />
    </div>
  );
}
