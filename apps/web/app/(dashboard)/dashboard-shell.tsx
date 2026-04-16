"use client";

import { useState, useTransition } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  LogOut,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/types/auth";
import type { NotificationRow } from "@/lib/queries/notifications";

import { signOut } from "./actions";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";

export function DashboardShell({
  user,
  unreadCount,
  recentNotifications,
  children,
}: {
  user: AuthUser;
  unreadCount: number;
  recentNotifications: NotificationRow[];
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r bg-background transition-[width] md:flex md:flex-col",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b px-3",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight">
              Roof-Aid
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SidebarNav role={user.role} collapsed={collapsed} />
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 md:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <SheetHeader className="border-b p-4">
                    <SheetTitle className="text-left">Roof-Aid</SheetTitle>
                  </SheetHeader>
                  <SidebarNav
                    role={user.role}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </SheetContent>
              </Sheet>
              <span className="text-lg font-semibold tracking-tight md:hidden">
                Roof-Aid
              </span>
              <span className="hidden text-xs capitalize text-muted-foreground sm:inline-block">
                {user.role.replace("_", " ")}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell userId={user.id} initialCount={unreadCount} initialNotifications={recentNotifications} />
              <span className="hidden text-sm text-muted-foreground md:inline-block">
                {displayName}
              </span>
              <Separator
                orientation="vertical"
                className="hidden h-6 md:block"
              />
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

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
