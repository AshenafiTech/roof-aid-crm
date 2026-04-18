import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import type {
  CloseRate,
  RiskCounts,
} from "@/lib/queries/dashboard-metrics";

export function CloseRateGauge({
  rate,
  risk,
}: {
  rate: CloseRate;
  risk: RiskCounts;
}) {
  const pct = Math.max(0, Math.min(100, rate.ratePct));
  // Semicircle gauge — 180deg arc mapped to 0-100.
  const angle = (pct / 100) * 180;
  // Needle position
  const rad = (Math.PI * (180 - angle)) / 180;
  const cx = 60;
  const cy = 60;
  const r = 46;
  const nx = cx + Math.cos(rad) * (r - 4);
  const ny = cy - Math.sin(rad) * (r - 4);

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Lead close rate</h2>
        <div className="mt-2 flex items-center justify-center">
          <svg viewBox="0 0 120 70" className="h-24 w-full max-w-[180px]">
            {/* Red band 0-30 */}
            <path
              d="M 14 60 A 46 46 0 0 1 32 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="10"
              strokeLinecap="butt"
            />
            {/* Amber band 30-60 */}
            <path
              d="M 32 24 A 46 46 0 0 1 88 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="10"
              strokeLinecap="butt"
            />
            {/* Green band 60-100 */}
            <path
              d="M 88 24 A 46 46 0 0 1 106 60"
              fill="none"
              stroke="#10b981"
              strokeWidth="10"
              strokeLinecap="butt"
            />
            {/* Needle */}
            <line
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r="3" fill="currentColor" />
          </svg>
        </div>
        <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
          <span>0%</span>
          <span className="text-base font-bold text-foreground">
            {pct.toFixed(2)}%
          </span>
          <span>100%</span>
        </div>
      </div>

      <div
        className={`mt-auto rounded-md border p-3 ${
          risk.staleCount > 0
            ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
            : "border-muted bg-muted/30"
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold leading-none">
              {risk.staleCount}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Stale leads (7d+ no activity)
            </p>
          </div>
          {risk.staleCount > 0 && (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          )}
        </div>
      </div>
    </Card>
  );
}
