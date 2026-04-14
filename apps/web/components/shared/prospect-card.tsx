import type { ReactNode } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export type ProspectCardData = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  assignedName?: string | null;
  hailSize?: number | null;
  homeValue?: number | null;
};

type Props = {
  prospect: ProspectCardData;
  actions?: ReactNode;
  className?: string;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ProspectCard({ prospect, actions, className }: Props) {
  const locationParts = [prospect.city, prospect.state].filter(Boolean);

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/prospects/${prospect.id}`}
            className="block truncate text-base font-semibold hover:underline"
          >
            {prospect.name}
          </Link>
          {(prospect.address || locationParts.length > 0) && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {[prospect.address, locationParts.join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
          )}
        </div>
        <StatusBadge status={prospect.status} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Assigned</dt>
          <dd className="mt-0.5 truncate">{prospect.assignedName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hail</dt>
          <dd className="mt-0.5">
            {prospect.hailSize != null ? `${prospect.hailSize}"` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Home value</dt>
          <dd className="mt-0.5 truncate">
            {prospect.homeValue != null
              ? currency.format(prospect.homeValue)
              : "—"}
          </dd>
        </div>
      </dl>

      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}
