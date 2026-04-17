"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function hrefFor(nextPage: number) {
    const params = new URLSearchParams(sp);
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/prospects?${qs}` : "/prospects";
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? "No results"
          : `Showing ${from}–${to} of ${total} · Page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          asChild={hasPrev}
          variant="outline"
          size="sm"
          disabled={!hasPrev}
        >
          {hasPrev ? (
            <Link href={hrefFor(page - 1)} prefetch={false}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </Link>
          ) : (
            <span>
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </span>
          )}
        </Button>
        <Button
          asChild={hasNext}
          variant="outline"
          size="sm"
          disabled={!hasNext}
        >
          {hasNext ? (
            <Link href={hrefFor(page + 1)} prefetch={false}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          ) : (
            <span>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
