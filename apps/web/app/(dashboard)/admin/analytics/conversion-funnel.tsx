import { Card } from "@/components/ui/card";
import type { ConversionMetrics } from "@/lib/queries/analytics";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && (
        <p className="mt-0.5 text-[11px] font-medium text-primary">{sub}</p>
      )}
    </div>
  );
}

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ConversionFunnel({
  conversion,
}: {
  conversion: ConversionMetrics;
}) {
  const {
    totalProspects,
    contacted,
    scheduled,
    closed,
    contactRate,
    scheduleRate,
    closeRate,
    dncCount,
    notViableCount,
  } = conversion;

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Conversion Funnel</h2>

      {/* Key rates */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat
          label="Contact Rate"
          value={`${contactRate.toFixed(1)}%`}
          sub={`${contacted} contacted`}
        />
        <Stat
          label="Schedule Rate"
          value={`${scheduleRate.toFixed(1)}%`}
          sub={`${scheduled} scheduled`}
        />
        <Stat
          label="Close Rate"
          value={`${closeRate.toFixed(1)}%`}
          sub={`${closed} closed`}
        />
      </div>

      {/* Funnel bars */}
      <div className="space-y-3">
        <FunnelBar
          label="Total Prospects"
          count={totalProspects}
          total={totalProspects}
          color="bg-blue-500"
        />
        <FunnelBar
          label="Contacted"
          count={contacted}
          total={totalProspects}
          color="bg-sky-500"
        />
        <FunnelBar
          label="Scheduled"
          count={scheduled}
          total={totalProspects}
          color="bg-sky-400"
        />
        <FunnelBar
          label="Closed"
          count={closed}
          total={totalProspects}
          color="bg-emerald-500"
        />
      </div>

      {/* Bottom stats */}
      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        <span>
          DNC: <strong className="text-foreground">{dncCount}</strong>
        </span>
        <span>
          Not Viable:{" "}
          <strong className="text-foreground">{notViableCount}</strong>
        </span>
      </div>
    </Card>
  );
}
