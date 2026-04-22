import { Calendar, CalendarCheck, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

type Stats = {
  today: number;
  upcoming: number;
  pending: number;
  completed: number;
};

export function AppointmentStats({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Today", value: stats.today, Icon: Calendar, color: "text-blue-500" },
    { label: "Upcoming", value: stats.upcoming, Icon: Clock, color: "text-sky-500" },
    { label: "Pending", value: stats.pending, Icon: CalendarCheck, color: "text-amber-500" },
    { label: "Completed", value: stats.completed, Icon: CheckCircle2, color: "text-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map(({ label, value, Icon, color }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <Icon className={`h-7 w-7 shrink-0 ${color} opacity-40`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
