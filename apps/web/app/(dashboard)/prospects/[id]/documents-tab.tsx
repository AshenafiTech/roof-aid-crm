"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
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

const STATUS_CLASS: Record<string, string> = {
  generated: "bg-gray-50 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  uploaded: "bg-violet-50 text-violet-700 border-violet-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

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
            const canSign = d.status === "generated" && !!d.storage_path;
            const createdBy =
              d.created_by_user
                ? [d.created_by_user.first_name, d.created_by_user.last_name]
                    .filter(Boolean)
                    .join(" ")
                : "";

            return (
              <Card
                key={d.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 ${
                  isSigned ? "border-l-4 border-l-emerald-400" : ""
                }`}
              >
                <Link
                  href={`/documents/${d.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${bg}`}
                  >
                    <Icon className={`h-5 w-5 ${fg}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {TYPE_LABEL[d.type] ?? d.type}
                      </p>
                      <Badge
                        variant="outline"
                        className={`shrink-0 capitalize ${
                          STATUS_CLASS[d.status ?? ""] ?? ""
                        }`}
                      >
                        {isSigned && (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        )}
                        {d.status ?? "—"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.created_at ? formatRelative(d.created_at) : "—"}
                      {createdBy ? ` · by ${createdBy}` : ""}
                      {d.page_count ? ` · ${d.page_count}pp` : ""}
                      {isSigned && d.signed_at
                        ? ` · signed ${formatRelative(d.signed_at)}`
                        : ""}
                    </p>
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-1.5">
                  {canSign ? (
                    <Button asChild size="sm">
                      <Link href={`/documents/${d.id}/sign`}>
                        <Pen className="mr-1.5 h-3.5 w-3.5" />
                        Sign
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
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
