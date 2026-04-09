"use client";

import { useTransition } from "react";
import { LogOut, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/lib/types/auth";

import { signOut } from "./actions";

export function DashboardShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">
              Roof-Aid
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline-block">
              {user.role.replace("_", " ")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline-block">
              {displayName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => startTransition(() => signOut())}
              aria-label="Sign out"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline-block">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
