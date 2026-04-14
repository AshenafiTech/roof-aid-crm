import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Appointments — Roof-Aid CRM",
};

export default function AppointmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Coming in Milestone 5 — calendar, scheduling, and reminders."
      />
    </div>
  );
}
