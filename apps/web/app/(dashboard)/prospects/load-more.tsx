"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LoadMore({
  showing,
  total,
  pageSize,
}: {
  showing: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  if (showing >= total) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        {total === 0 ? "No results" : `Showing all ${total} prospects`}
      </p>
    );
  }

  function loadMore() {
    const params = new URLSearchParams(sp);
    params.set("load", String(showing + pageSize));
    const qs = params.toString();
    start(() => router.push(qs ? `/prospects?${qs}` : "/prospects"));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">
        {showing} de {total}
      </p>
      <Button variant="outline" onClick={loadMore} disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Load {pageSize} More
      </Button>
    </div>
  );
}
