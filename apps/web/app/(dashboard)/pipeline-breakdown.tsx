import { Card } from "@/components/ui/card";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
} from "@/lib/constants/prospect-status";
import type { PipelineCount } from "@/lib/queries/dashboard";

export function PipelineBreakdown({
  pipeline,
}: {
  pipeline: PipelineCount[];
}) {
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  const map = new Map(pipeline.map((p) => [p.status, p.count]));

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Pipeline</h2>
      <div className="space-y-3">
        {PROSPECT_STATUSES.map((status) => {
          const count = map.get(status) ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={status}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{PROSPECT_STATUS_LABELS[status]}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No prospects yet.
        </p>
      )}
    </Card>
  );
}
