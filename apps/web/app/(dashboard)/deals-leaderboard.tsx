import { Card } from "@/components/ui/card";
import type { LeaderboardRow } from "@/lib/queries/dashboard-metrics";

function formatCurrencyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "—";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DealsLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const ranked = rows.filter((r) => r.closedCount > 0).slice(0, 6);

  return (
    <Card className="flex h-full flex-col p-4">
      <h2 className="text-sm font-semibold">Deals closed this month</h2>
      {ranked.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-muted-foreground">
          No closed deals this month yet.
        </p>
      ) : (
        <div className="mt-3 flex-1 overflow-hidden">
          <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Rep</span>
            <span className="text-right">Deals</span>
            <span className="text-right">Value</span>
          </div>
          <ul className="divide-y text-sm">
            {ranked.map((r) => (
              <li
                key={r.userId}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {initials(r.name)}
                  </span>
                  <span className="truncate">{r.name}</span>
                </div>
                <span className="text-right tabular-nums">{r.closedCount}</span>
                <span className="text-right font-semibold tabular-nums">
                  {formatCurrencyShort(r.closedValue)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
