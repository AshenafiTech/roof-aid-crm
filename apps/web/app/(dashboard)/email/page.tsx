import { PageHeader } from "@/components/shared/page-header";
import { EmailComposer } from "./email-composer";

export const metadata = {
  title: "Quick Email — Roof-Aid CRM",
};

export default function EmailPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quick Email"
        description="Send emails to prospects and leads."
      />
      <EmailComposer />
    </div>
  );
}
