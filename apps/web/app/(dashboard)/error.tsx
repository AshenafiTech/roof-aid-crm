"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

// Dashboard-segment error boundary. Catches throws from any dashboard page
// or from the dashboard layout's own data fetches (current user,
// notifications, etc.). Renders inside the shell when possible, so the
// sidebar stays mounted and the user can navigate elsewhere instead of
// hitting the browser's generic "This page couldn't load" screen.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Something went wrong"
        description="We couldn't load this page. This is usually temporary — please try again."
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/dashboard";
          }}
        >
          Go to dashboard
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Reference{" "}
          <code className="font-mono">{error.digest}</code> — share with
          support if this keeps happening.
        </p>
      )}
    </div>
  );
}
