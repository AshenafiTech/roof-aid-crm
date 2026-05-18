import { PageHeader } from "@/components/shared/page-header";

import { CompanySignatureForm } from "./company-signature-form";
import { loadCompanySignature } from "./actions";

export const metadata = { title: "Company signature — Settings" };

export default async function CompanySignaturePage() {
  const state = await loadCompanySignature();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company signature"
        description="Save a single signature that will be automatically applied to every generated document on the Representative line. Saves the homeowner one round-trip with you."
      />

      <CompanySignatureForm initial={state} />
    </div>
  );
}
