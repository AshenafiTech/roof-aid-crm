import { Card } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";

import type { ActivityWithUser } from "./types";
import { displayName } from "./types";

const TYPE_LABELS: Record<string, string> = {
  status_change: "Status change",
  note_added: "Note added",
  call: "Call",
  sms: "SMS",
  email: "Email",
  appointment: "Appointment",
  document: "Document",
  assignment: "Assignment",
  dnc: "Do not call",
  prospect_update: "Prospect updated",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function summarize(a: ActivityWithUser): string {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  if (a.type === "status_change") {
    return `${String(meta.from ?? "—")} → ${String(meta.to ?? "—")}`;
  }
  if (a.type === "assignment") {
    return `${String(meta.from ?? "unassigned")} → ${String(meta.to ?? "unassigned")}`;
  }
  if (a.type === "note_added" && typeof meta.preview === "string") {
    return meta.preview;
  }
  if (a.type === "prospect_update") {
    return "Overview fields updated";
  }
  return "—";
}

const columns: DataTableColumn<ActivityWithUser>[] = [
  {
    key: "when",
    header: "When",
    cell: (row) => (
      <span className="text-sm">{formatTimestamp(row.created_at)}</span>
    ),
    headerClassName: "w-48",
  },
  {
    key: "type",
    header: "Type",
    cell: (row) => (
      <span className="text-sm font-medium">
        {TYPE_LABELS[row.type] ?? row.type}
      </span>
    ),
    headerClassName: "w-40",
  },
  {
    key: "who",
    header: "Who",
    cell: (row) => <span className="text-sm">{displayName(row.user)}</span>,
    headerClassName: "w-40",
  },
  {
    key: "detail",
    header: "Detail",
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{summarize(row)}</span>
    ),
  },
];

export function ActivityTab({
  activities,
}: {
  activities: ActivityWithUser[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <DataTable
        columns={columns}
        rows={activities}
        rowKey={(row) => row.id}
        empty="No activity yet."
      />
    </Card>
  );
}
