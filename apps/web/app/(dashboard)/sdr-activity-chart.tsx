import { Card } from "@/components/ui/card";
import type { LeaderboardRow } from "@/lib/queries/dashboard-metrics";

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? full;
}

export function SdrActivityChart({ rows }: { rows: LeaderboardRow[] }) {
  const top = rows.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => Math.max(r.callsToday, r.appointmentsSet)));
  const hasCallData = top.some((r) => r.callsToday > 0);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">SDR activity</h2>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
            Calls
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Meetings booked
          </span>
        </div>
      </div>

      {top.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-muted-foreground">
          No team members yet.
        </p>
      ) : (
        <div className="relative flex-1">
          <div className="absolute inset-0 flex items-end gap-3 pb-5 pt-2">
            {top.map((r) => {
              const callsH = (r.callsToday / max) * 100;
              const meetingsH = (r.appointmentsSet / max) * 100;
              return (
                <div
                  key={r.userId}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                >
                  <div className="flex h-full w-full items-end justify-center gap-0.5">
                    <div
                      className="w-2 rounded-t-sm bg-sky-500 transition-all"
                      style={{ height: `${Math.max(1, callsH)}%` }}
                      title={`${firstName(r.name)}: ${r.callsToday} calls today`}
                    />
                    <div
                      className="w-2 rounded-t-sm bg-amber-400 transition-all"
                      style={{ height: `${Math.max(1, meetingsH)}%` }}
                      title={`${firstName(r.name)}: ${r.appointmentsSet} meetings booked (7d)`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-3">
            {top.map((r) => (
              <span
                key={r.userId}
                className="flex-1 truncate text-center text-[10px] text-muted-foreground"
              >
                {firstName(r.name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!hasCallData && (
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          Call data will populate once calling is set up for your tenant.
        </p>
      )}
    </Card>
  );
}
