import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — Roof-Aid CRM",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role ?? "unknown";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. You are signed in as{" "}
          <span className="font-medium text-foreground">{role}</span>.
        </p>
      </div>

      {/* Placeholder cards — will be replaced with real widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Prospects", "Appointments", "Documents", "Notifications"].map(
          (label) => (
            <div
              key={label}
              className="rounded-lg border bg-card p-6 text-card-foreground"
            >
              <p className="text-sm font-medium text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold">—</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
