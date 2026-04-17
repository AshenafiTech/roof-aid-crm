import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_ACCENTS,
  PROSPECT_STATUS_LABELS,
} from "@/lib/constants/prospect-status";
import { cn } from "@/lib/utils";

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium">Row colors:</span>
      {PROSPECT_STATUSES.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-3 w-1 rounded-sm border-l-4",
              PROSPECT_STATUS_ACCENTS[status],
            )}
          />
          {PROSPECT_STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}
