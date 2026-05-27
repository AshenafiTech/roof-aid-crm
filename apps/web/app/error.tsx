"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Root error boundary — catches any Server Component error that bubbles up
// from any page or layout in the app. Without this file Next.js falls back
// to a bare 500 response, which the browser surfaces as the user-hostile
// "This page couldn't load" message.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure to Vercel logs with a stable prefix so we can
    // grep for client-rendered errors quickly.
    console.error("[root-error-boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Something went wrong.</h1>
              <p className="text-sm text-muted-foreground">
                We hit a snag loading this page. This is usually temporary —
                please try again.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
              <Button onClick={reset}>Try again</Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined") window.location.href = "/";
                }}
              >
                Go home
              </Button>
            </div>
            {error.digest && (
              <p className="text-xs text-muted-foreground">
                If this keeps happening, mention reference{" "}
                <code className="font-mono">{error.digest}</code> to support.
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
