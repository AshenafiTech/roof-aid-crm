"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canAssignProspects } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/types/auth";

import { assignProspect } from "./actions";
import type {
  ActivityWithUser,
  ProspectWithAssignee,
  UserLite,
} from "./types";
import { displayName } from "./types";

const UNASSIGNED = "__unassigned__";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function lookupName(id: string | null | undefined, pool: UserLite[]): string {
  if (!id) return "Unassigned";
  const match = pool.find((u) => u.id === id);
  return match ? displayName(match) : id;
}

export function AssignmentTab({
  prospect,
  activities,
  ruferos,
  currentUser,
}: {
  prospect: ProspectWithAssignee;
  activities: ActivityWithUser[];
  ruferos: UserLite[];
  currentUser: AuthUser;
}) {
  const [pending, start] = useTransition();
  const canAssign = canAssignProspects(currentUser.role);
  const history = activities.filter((a) => a.type === "assignment");

  function onChange(next: string) {
    const assignedTo = next === UNASSIGNED ? null : next;
    if (assignedTo === prospect.assigned_to) return;
    start(async () => {
      try {
        await assignProspect({ id: prospect.id, assignedTo });
        toast.success(
          assignedTo
            ? `Assigned to ${lookupName(assignedTo, ruferos)}`
            : "Unassigned",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to reassign",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assigned to
            </span>
            <span className="text-base font-medium">
              {displayName(prospect.assigned_user)}
            </span>
          </div>
          {canAssign ? (
            <Select
              value={prospect.assigned_to ?? UNASSIGNED}
              onValueChange={onChange}
              disabled={pending}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Assign rufero" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {ruferos.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {displayName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners and admins can reassign.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-3 text-sm font-semibold">Assignment history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reassignments yet.
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
                  <p className="text-sm">
                    <span className="font-medium">
                      {lookupName(meta.from, ruferos)}
                    </span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="font-medium">
                      {lookupName(meta.to, ruferos)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    by {displayName(a.user)} · {formatTimestamp(a.created_at)}
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
