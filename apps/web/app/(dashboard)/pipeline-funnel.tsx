import { Card } from "@/components/ui/card";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_BAR_COLORS,
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";
import type { PipelineCount } from "@/lib/queries/dashboard";

// Pipeline stages we show in the funnel (skip "not_viable" — that's a dead-end).
const FUNNEL_STAGES: ProspectStatus[] = [
  "new_leads",
  "prospects",
  "contacted",
  "follow_up",
  "scheduled",
  "closed_customer",
];

export function PipelineFunnel({ pipeline }: { pipeline: PipelineCount[] }) {
  const map = new Map(pipeline.map((p) => [p.status, p.count]));
  const max = Math.max(1, ...FUNNEL_STAGES.map((s) => map.get(s) ?? 0));

  return (
    <Card className="flex h-full flex-col p-6">
      <h2 className="text-sm font-semibold">Pipeline</h2>
      <div className="mt-5 flex flex-1 flex-col justify-between gap-4">
        {FUNNEL_STAGES.map((status) => {
          const count = map.get(status) ?? 0;
          const pct = (count / max) * 100;
          return (
            <div key={status}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {PROSPECT_STATUS_LABELS[status]}
                </span>
                <span className="font-semibold tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-[width] ${PROSPECT_STATUS_BAR_COLORS[status]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
