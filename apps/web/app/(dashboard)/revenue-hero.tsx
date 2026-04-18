import { Card } from "@/components/ui/card";
import type { RevenueBucket } from "@/lib/queries/dashboard-metrics";

function formatCurrencyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function RevenueHero({ revenue }: { revenue: RevenueBucket }) {
  const target = revenue.monthlyTarget;
  const monthPct = target > 0 ? Math.min(100, (revenue.monthRevenue / target) * 100) : 0;

  return (
    <Card className="flex h-full flex-col justify-between px-6 py-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Closed this quarter
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          {formatCurrencyShort(revenue.quarterRevenue)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          YTD {formatCurrencyShort(revenue.yearRevenue)}
        </p>
      </div>

      <div className="mt-6">
        <div className="mb-1 flex items-end justify-between text-xs text-muted-foreground">
          <span className="font-medium">
            {Math.round(monthPct)}% of {formatCurrencyShort(target)} monthly target
          </span>
          <span>{formatCurrencyShort(revenue.monthRevenue)} MTD</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${monthPct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

export function ClosedWonCard({ revenue }: { revenue: RevenueBucket }) {
  const nothingClosed =
    revenue.monthRevenue === 0 && revenue.todayRevenue === 0;

  return (
    <Card className="px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Closed / won
      </p>

      {nothingClosed ? (
        <div className="mt-3 rounded-md border border-dashed px-3 py-3 text-center">
          <p className="text-sm font-medium">No closed deals yet</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Move a prospect to <span className="font-medium">Closed Customer</span> to see revenue here.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 px-2.5 py-2">
            <p className="truncate text-xl font-bold leading-tight text-primary">
              {formatCurrencyShort(revenue.monthRevenue)}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {revenue.monthClosedCount} deals MTD
            </p>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <p className="truncate text-xl font-bold leading-tight text-foreground">
              {formatCurrencyShort(revenue.todayRevenue)}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {revenue.todayClosedCount} today
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
