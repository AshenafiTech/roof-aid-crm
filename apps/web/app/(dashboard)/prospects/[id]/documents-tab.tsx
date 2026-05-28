"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileSignature,
  FileText,
  FilePlus2,
  Pen,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRole } from "@/lib/types/auth";
import type { DocumentListItem } from "@/lib/queries/documents";

import { DocumentRowActions } from "@/components/shared/document-actions";
import { NewDocumentDialog } from "@/components/shared/new-document-dialog";

// Snake_case status → presentation. Each entry pairs a human label
// with a small icon + tinted chip styling that holds up in dark mode.
type StatusMeta = {
  label: string;
  Icon: typeof CheckCircle2 | null;
  className: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  generated: {
    label: "Draft",
    Icon: FileText,
    className:
      "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
  },
  awaiting_homeowner_signature: {
    label: "Awaiting homeowner",
    Icon: Clock,
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  },
  sent: {
    label: "Sent",
    Icon: null,
    className:
      "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300",
  },
  signed: {
    label: "Signed",
    Icon: CheckCircle2,
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  uploaded: {
    label: "Uploaded",
    Icon: Upload,
    className:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300",
  },
  failed: {
    label: "Failed",
    Icon: null,
    className:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
  },
};

function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return {
    label: status ?? "—",
    Icon: null,
    className: "border-border bg-muted text-muted-foreground",
  };
}

const TYPE_LABEL: Record<string, string> = {
  "3rd_party_auth": "3rd Party Authorization",
  acv_contract: "ACV Contract",
  rcv_contract: "RCV Contract",
  supplement: "Supplement",
  upload: "Uploaded PDF",
};

const TYPE_ICON: Record<
  string,
  { Icon: typeof FileText; bg: string; fg: string }
> = {
  "3rd_party_auth": {
    Icon: FileSignature,
    bg: "bg-orange-100 dark:bg-orange-950",
    fg: "text-orange-700 dark:text-orange-300",
  },
  acv_contract: {
    Icon: FileText,
    bg: "bg-blue-100 dark:bg-blue-950",
    fg: "text-blue-700 dark:text-blue-300",
  },
  rcv_contract: {
    Icon: FileText,
    bg: "bg-indigo-100 dark:bg-indigo-950",
    fg: "text-indigo-700 dark:text-indigo-300",
  },
  supplement: {
    Icon: FileText,
    bg: "bg-amber-100 dark:bg-amber-950",
    fg: "text-amber-700 dark:text-amber-300",
  },
  upload: {
    Icon: Upload,
    bg: "bg-violet-100 dark:bg-violet-950",
    fg: "text-violet-700 dark:text-violet-300",
  },
};

function getTypeIcon(type: string) {
  return (
    TYPE_ICON[type] ?? {
      Icon: FileText,
      bg: "bg-muted",
      fg: "text-muted-foreground",
    }
  );
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function DocumentsTab({
  prospectId,
  prospectName,
  documents,
  currentUserRole,
}: {
  prospectId: string;
  prospectName: string;
  documents: DocumentListItem[];
  currentUserRole: UserRole;
}) {
  const [open, setOpen] = useState(false);

  // Auto-reopen the dialog when the user lands here via `?new=1` redirect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newDoc") === "1") setOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Documents</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          New document
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium">No documents yet</p>
          <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
            Generate a 3rd Party Authorization, ACV, or RCV contract.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setOpen(true)}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New document
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => {
            const { Icon, bg, fg } = getTypeIcon(d.type);
            const isSigned = d.status === "signed";
            const isAwaiting = d.status === "awaiting_homeowner_signature";
            const canSign = d.status === "generated" && !!d.storage_path;
            const statusMeta = getStatusMeta(d.status);
            const StatusIcon = statusMeta.Icon;
            const createdBy = d.created_by_user
              ? [d.created_by_user.first_name, d.created_by_user.last_name]
                  .filter(Boolean)
                  .join(" ")
              : "";

            // Subtle left-edge accent that carries the status color so
            // owners can scan a list of docs at a glance.
            const accent = isSigned
              ? "border-l-4 border-l-emerald-400"
              : isAwaiting
                ? "border-l-4 border-l-amber-400"
                : "border-l-4 border-l-transparent";

            return (
              <Card
                key={d.id}
                className={`group relative flex items-center gap-4 px-4 py-3 transition-all hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm ${accent}`}
              >
                {/* Overlay link makes the whole card clickable. Interactive
                    children (Sign / View / ⋯) opt back in via
                    pointer-events-auto so their handlers still fire. */}
                <Link
                  href={`/documents/${d.id}`}
                  className="absolute inset-0 z-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Open ${TYPE_LABEL[d.type] ?? d.type}`}
                >
                  <span className="sr-only">Open document</span>
                </Link>

                <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${bg}`}
                  >
                    <Icon className={`h-5 w-5 ${fg}`} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-semibold leading-none">
                        {TYPE_LABEL[d.type] ?? d.type}
                      </p>
                      <Badge
                        variant="outline"
                        className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${statusMeta.className}`}
                      >
                        {StatusIcon && <StatusIcon className="h-3 w-3" />}
                        {statusMeta.label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.created_at ? `Created ${formatRelative(d.created_at)}` : "—"}
                      {createdBy ? ` · ${createdBy}` : ""}
                      {d.page_count
                        ? ` · ${d.page_count} page${d.page_count === 1 ? "" : "s"}`
                        : ""}
                      {isSigned && d.signed_at
                        ? ` · signed ${formatRelative(d.signed_at)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                  {canSign ? (
                    <Button asChild size="sm">
                      <Link href={`/documents/${d.id}/sign`}>
                        <Pen className="mr-1.5 h-3.5 w-3.5" />
                        Sign
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/documents/${d.id}`}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Link>
                    </Button>
                  )}
                  <DocumentRowActions
                    document={d}
                    currentUserRole={currentUserRole}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewDocumentDialog
        open={open}
        onOpenChange={setOpen}
        prospectId={prospectId}
        prospectName={prospectName}
      />
    </div>
  );
}
