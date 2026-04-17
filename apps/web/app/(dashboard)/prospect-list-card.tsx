"use client";

import Link from "next/link";
import { Phone, MapPin } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import {
  PROSPECT_STATUS_ACCENTS,
  isProspectStatus,
} from "@/lib/constants/prospect-status";
import { cn } from "@/lib/utils";
import type { ProspectListItem } from "@/lib/queries/prospects";

function formatAssigned(
  assigned: ProspectListItem["assigned_user"],
): string {
  if (!assigned) return "";
  const name = [assigned.first_name, assigned.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "";
}

export function ProspectListCard({ prospect }: { prospect: ProspectListItem }) {
  const status = isProspectStatus(prospect.status) ? prospect.status : null;
  const accent = status
    ? PROSPECT_STATUS_ACCENTS[status]
    : "border-l-transparent";
  const assignee = formatAssigned(prospect.assigned_user);
  const location = [prospect.city, prospect.state].filter(Boolean).join(", ");

  return (
    <Link
      href={`/prospects/${prospect.id}`}
      className={cn(
        "block border-l-4 px-4 py-3 transition-colors hover:bg-muted/40",
        accent,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{prospect.name}</p>
            <StatusBadge status={prospect.status} className="shrink-0" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {location}
              </span>
            )}
            {prospect.phones?.[0] && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {prospect.phones[0]}
              </span>
            )}
            {assignee && <span>{assignee}</span>}
          </div>
        </div>
        {prospect.do_not_call && (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            DNC
          </span>
        )}
      </div>
    </Link>
  );
}
