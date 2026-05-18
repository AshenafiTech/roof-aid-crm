import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";

import { listPhoneNumbers } from "./actions";
import { PhoneNumbersManagement } from "./phone-numbers-management";

export const metadata = {
  title: "Phone Numbers — Roof-Aid CRM",
};

export default async function PhoneNumbersPage() {
  const user = await getCurrentUser();

  if (
    user.role !== "owner" &&
    user.role !== "admin" &&
    user.role !== "super_admin"
  ) {
    redirect("/");
  }

  const numbers = await listPhoneNumbers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phone Numbers"
        description="Buy, label, and route the dedicated business numbers homeowners use to reach you."
      />
      <PhoneNumbersManagement initialNumbers={numbers} />
    </div>
  );
}
