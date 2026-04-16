import { Card } from "@/components/ui/card";
import type { TeamMember } from "@/lib/queries/analytics";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  telefonista: "Telefonista",
  rufero: "Rufero",
};

export function TeamPerformance({ team }: { team: TeamMember[] }) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Team Performance</h2>
      {team.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active team members found.
        </p>
      ) : (
        <div className="space-y-0 divide-y">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 pb-2 text-xs font-medium text-muted-foreground">
            <span>Member</span>
            <span className="text-right">Assigned</span>
            <span className="text-right">Closed</span>
            <span className="text-right">Actions</span>
          </div>
          {team.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABELS[m.role] ?? m.role}
                </p>
              </div>
              <p className="text-right tabular-nums">{m.prospectCount}</p>
              <p className="text-right tabular-nums text-emerald-600">
                {m.closedCount}
              </p>
              <p className="text-right tabular-nums text-muted-foreground">
                {m.activityCount}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
