"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export default function ProspectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Something went wrong"
        description={error.message || "Failed to load the prospect."}
      />
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
