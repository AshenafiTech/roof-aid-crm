import { Card } from "@/components/ui/card";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_BAR_COLORS,
} from "@/lib/constants/prospect-status";
import type { PipelineCount } from "@/lib/queries/dashboard";

export function PipelineStatusCards({
  pipeline,
  todayAppointments,
}: {
  pipeline: PipelineCount[];
  todayAppointments: number;
}) {
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  const map = new Map(pipeline.map((p) => [p.status, p.count]));

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <Card className="relative overflow-hidden px-3 py-2.5">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
        <p className="text-xl font-semibold">{total}</p>
        <p className="text-[11px] text-muted-foreground">Total</p>
      </Card>
      {PROSPECT_STATUSES.map((status) => {
        const count = map.get(status) ?? 0;
        const barColor = PROSPECT_STATUS_BAR_COLORS[status];
        return (
          <Card key={status} className="relative overflow-hidden px-3 py-2.5">
            <div className={`absolute inset-x-0 top-0 h-1 ${barColor}`} />
            <p className="text-xl font-semibold">{count}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {PROSPECT_STATUS_LABELS[status]}
            </p>
          </Card>
        );
      })}
      <Card className="relative overflow-hidden px-3 py-2.5">
        <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
        <p className="text-xl font-semibold">{todayAppointments}</p>
        <p className="text-[11px] text-muted-foreground">Today&apos;s Appts</p>
      </Card>
    </div>
  );
}
