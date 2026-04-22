import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { RecentDeal } from "@/lib/queries/dashboard-metrics";

function formatCurrencyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "—";
}

export function RecentDeals({ deals }: { deals: RecentDeal[] }) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h2 className="text-sm font-semibold">Recent deals</h2>
      {deals.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-muted-foreground">
          No closed deals yet.
        </p>
      ) : (
        <div className="mt-3 flex-1 overflow-hidden">
          <div className="mb-1 flex items-center justify-between border-b pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Client</span>
            <span>Value</span>
          </div>
          <ul className="divide-y text-sm">
            {deals.slice(0, 8).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-1.5">
                <Link
                  href={`/prospects/${d.id}`}
                  className="min-w-0 flex-1 truncate pr-2 hover:underline"
                  title={d.name}
                >
                  {d.name}
                </Link>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatCurrencyShort(Number(d.homeValue ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
