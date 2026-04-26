"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FollowUpNoteDialog } from "@/components/shared/follow-up-note-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  isProspectStatus,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";
import { canTransition } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/types/auth";

import { changeStatus } from "./actions";
import type { ActivityWithUser, ProspectWithAssignee } from "./types";
import { displayName } from "./types";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function PipelineTab({
  prospect,
  activities,
  currentUser,
}: {
  prospect: ProspectWithAssignee;
  activities: ActivityWithUser[];
  currentUser: AuthUser;
}) {
  const [pending, start] = useTransition();
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const current = isProspectStatus(prospect.status) ? prospect.status : null;

  const history = activities.filter((a) => a.type === "status_change");

  function applyChange(next: ProspectStatus, followUpNote?: string) {
    start(async () => {
      try {
        await changeStatus({ id: prospect.id, status: next, followUpNote });
        toast.success(`Status changed to ${PROSPECT_STATUS_LABELS[next]}`);
        setFollowUpOpen(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to change status",
        );
      }
    });
  }

  function onChange(next: string) {
    if (!isProspectStatus(next)) return;
    if (next === current) return;
    if (!canTransition(currentUser.role, current, next)) {
      toast.error("You don't have permission for that status change");
      return;
    }
    if (next === "follow_up") {
      setFollowUpOpen(true);
      return;
    }
    applyChange(next);
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Current status
            </span>
            <StatusBadge status={prospect.status} />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={current ?? undefined}
              onValueChange={onChange}
              disabled={pending}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Change status" />
              </SelectTrigger>
              <SelectContent>
                {PROSPECT_STATUSES.map((s: ProspectStatus) => {
                  const allowed = canTransition(currentUser.role, current, s);
                  return (
                    <SelectItem key={s} value={s} disabled={!allowed}>
                      {PROSPECT_STATUS_LABELS[s]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <FollowUpNoteDialog
        open={followUpOpen}
        onOpenChange={(o) => {
          if (!pending) setFollowUpOpen(o);
        }}
        prospectName={prospect.name}
        pending={pending}
        onSave={(note) => applyChange("follow_up", note)}
      />

      <Card className="p-6">
        <h3 className="mb-3 text-sm font-semibold">Status history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No status changes yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((a) => {
              const meta = (a.metadata ?? {}) as {
                from?: string | null;
                to?: string | null;
              };
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-1 border-l-2 border-muted pl-4"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <StatusBadge status={meta.from} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={meta.to} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {displayName(a.user)} · {formatTimestamp(a.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
