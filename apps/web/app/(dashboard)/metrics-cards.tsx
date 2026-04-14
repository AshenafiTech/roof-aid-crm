import { Bell, Calendar, TrendingUp, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { PipelineCount } from "@/lib/queries/dashboard";

export function MetricsCards({
  pipeline,
  todayAppointments,
  unreadNotifications,
}: {
  pipeline: PipelineCount[];
  todayAppointments: number;
  unreadNotifications: number;
}) {
  const totalProspects = pipeline.reduce((sum, p) => sum + p.count, 0);
  const closed =
    pipeline.find((p) => p.status === "closed_customer")?.count ?? 0;
  const conversionRate =
    totalProspects > 0
      ? `${((closed / totalProspects) * 100).toFixed(1)}%`
      : "0.0%";

  const cards = [
    { label: "Total Prospects", value: totalProspects, Icon: Users },
    { label: "Today's Appointments", value: todayAppointments, Icon: Calendar },
    {
      label: "Unread Notifications",
      value: unreadNotifications,
      Icon: Bell,
    },
    { label: "Conversion Rate", value: conversionRate, Icon: TrendingUp },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, Icon }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
            <Icon className="h-8 w-8 shrink-0 text-muted-foreground/40" />
          </div>
        </Card>
      ))}
    </div>
  );
}
