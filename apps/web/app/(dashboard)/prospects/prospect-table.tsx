"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  PROSPECT_STATUS_ACCENTS,
  PROSPECT_STATUS_ROW_BG,
  isProspectStatus,
} from "@/lib/constants/prospect-status";
import { cn } from "@/lib/utils";
import type { ProspectListItem } from "@/lib/queries/prospects";

import { ProspectRowActions } from "./prospect-row-actions";

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatAssigned(
  assigned: ProspectListItem["assigned_user"],
): string {
  if (!assigned) return "—";
  const name = [assigned.first_name, assigned.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "—";
}

function formatLocation(row: ProspectListItem): string {
  const parts = [row.city, row.state].filter(Boolean).join(", ");
  return parts || "—";
}

export function ProspectTable({ rows }: { rows: ProspectListItem[] }) {
  const router = useRouter();

  function navigate(id: string) {
    router.push(`/prospects/${id}`);
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="max-w-[220px]">Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead className="w-20">Hail</TableHead>
            <TableHead className="w-32">Home Value</TableHead>
            <TableHead className="w-[220px]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-32 text-center text-sm text-muted-foreground"
              >
                No prospects match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const status = isProspectStatus(row.status) ? row.status : null;
              const accent = status
                ? PROSPECT_STATUS_ACCENTS[status]
                : "border-l-transparent";
              const rowBg = status ? PROSPECT_STATUS_ROW_BG[status] : "";

              return (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open ${row.name}`}
                  onClick={() => navigate(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(row.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-l-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    accent,
                    rowBg,
                  )}
                >
                  <TableCell className="max-w-[220px] truncate">
                    <Link
                      href={`/prospects/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{row.address ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatLocation(row)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {formatAssigned(row.assigned_user)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {row.hail_size != null ? `${row.hail_size}"` : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {formatCurrency(row.home_value)}
                    </span>
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ProspectRowActions
                      prospectId={row.id}
                      prospectName={row.name}
                      doNotCall={row.do_not_call ?? false}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
