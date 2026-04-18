import { Card } from "@/components/ui/card";
import type { DailySalesPoint } from "@/lib/queries/dashboard-metrics";

function formatCurrencyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "$0";
}

export function CumulativeSalesChart({
  data,
}: {
  data: DailySalesPoint[];
}) {
  // Build a cumulative series from the daily amounts.
  let running = 0;
  const series = data.map((d) => {
    running += d.amount;
    return { day: d.day, amount: d.amount, cumulative: running };
  });

  const max = Math.max(1, ...series.map((s) => s.cumulative));
  const today = new Date().getDate();

  // Y-axis ticks — 4 evenly spaced bands.
  const ticks = [0.25, 0.5, 0.75, 1].map((ratio) => max * ratio);

  return (
    <Card className="flex h-full flex-col p-6">
      <h2 className="text-sm font-semibold">Cumulative sales this month</h2>

      <div className="relative mt-5 flex-1">
        {/* Y-axis gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {[...ticks].reverse().map((t) => (
            <div key={t} className="flex items-center">
              <span className="w-12 shrink-0 text-[10px] text-muted-foreground">
                {formatCurrencyShort(t)}
              </span>
              <div className="ml-2 h-px flex-1 bg-muted/50" />
            </div>
          ))}
          <div className="flex items-center">
            <span className="w-12 shrink-0 text-[10px] text-muted-foreground">
              $0
            </span>
            <div className="ml-2 h-px flex-1 bg-muted" />
          </div>
        </div>

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-px pb-5 pl-14 pr-2">
          {series.map((s) => {
            const pct = (s.cumulative / max) * 100;
            const isToday = Number(s.day) === today;
            const color = isToday ? "bg-emerald-500" : "bg-sky-400";
            return (
              <div key={s.day} className="flex flex-1 flex-col items-center justify-end">
                <div
                  className={`w-full rounded-t-sm ${color} transition-all`}
                  style={{ height: `${Math.max(1, pct)}%` }}
                  title={`Day ${s.day}: ${formatCurrencyShort(s.cumulative)}`}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis labels — show every ~7 days */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between pl-14 pr-2 text-[10px] text-muted-foreground">
          {[1, 7, 14, 21, 28].map((d) =>
            d <= series.length ? <span key={d}>{d}</span> : null,
          )}
        </div>
      </div>
    </Card>
  );
}
