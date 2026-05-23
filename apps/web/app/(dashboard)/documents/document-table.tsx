"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRole } from "@/lib/types/auth";
import type { DocumentListItem } from "@/lib/queries/documents";

import { DocumentRowActions } from "@/components/shared/document-actions";

const STATUS_CLASS: Record<string, string> = {
  generated: "bg-gray-50 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  uploaded: "bg-violet-50 text-violet-700 border-violet-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

const TYPE_LABEL: Record<string, string> = {
  "3rd_party_auth": "3rd Party Auth",
  acv_contract: "ACV Contract",
  rcv_contract: "RCV Contract",
  supplement: "Supplement",
  upload: "Uploaded PDF",
};

function fullName(
  u: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!u) return "—";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function DocumentTable({
  documents,
  total,
  currentPage,
  pageSize,
  currentUserRole,
}: {
  documents: DocumentListItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const next = new URLSearchParams(sp);
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    start(() => router.push(qs ? `/documents?${qs}` : "/documents"));
  }

  if (documents.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">No documents yet</h3>
        <p className="mt-1.5 max-w-[260px] text-xs text-muted-foreground">
          Generate one from a prospect's profile, or upload an existing PDF.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1.4fr_1fr_140px_140px_180px_60px] items-center gap-3 px-4 text-xs font-medium text-muted-foreground lg:grid">
        <span>Prospect</span>
        <span>Type</span>
        <span>Status</span>
        <span>Pages</span>
        <span>Created</span>
        <span></span>
      </div>

      <div className="space-y-2">
        {documents.map((d) => (
          <Card key={d.id} className="px-4 py-3">
            <div className="grid items-center gap-3 lg:grid-cols-[1.4fr_1fr_140px_140px_180px_60px]">
              <div className="min-w-0">
                {d.prospect ? (
                  <Link
                    href={`/prospects/${d.prospect.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {d.prospect.name}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    (Deleted)
                  </span>
                )}
                {d.prospect?.city && (
                  <p className="text-xs text-muted-foreground">
                    {d.prospect.city}
                  </p>
                )}
              </div>

              <div className="text-sm">
                {TYPE_LABEL[d.type] ?? d.type}
              </div>

              <div>
                <Badge
                  variant="outline"
                  className={`w-fit capitalize ${STATUS_CLASS[d.status ?? ""] ?? ""}`}
                >
                  {d.status ?? "—"}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground">
                {d.page_count ? `${d.page_count} pp` : "—"}
              </div>

              <div className="text-xs text-muted-foreground">
                <p>{relative(d.created_at)}</p>
                <p>by {fullName(d.created_by_user)}</p>
              </div>

              <div className="flex justify-end">
                <DocumentRowActions
                  document={d}
                  currentUserRole={currentUserRole}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage <= 1 || pending}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage >= totalPages || pending}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
