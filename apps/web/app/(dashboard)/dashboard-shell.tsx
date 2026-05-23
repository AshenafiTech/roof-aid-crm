"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronRight, Loader2, LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/types/auth";
import type { NotificationRow } from "@/lib/queries/notifications";

import { signOut } from "./actions";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";
import { Softphone } from "@/components/comms/softphone";

function BrandMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M4 11l8-7 8 7v8a1 1 0 01-1 1H5a1 1 0 01-1-1z"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <path d="M4 11l8-7 8 7" />
      <path d="M12 4v16" />
    </svg>
  );
}

function getInitials(user: AuthUser) {
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  if (first || last) return `${first}${last}`.toUpperCase();
  return (user.email?.[0] ?? "?").toUpperCase();
}

export function DashboardShell({
  user,
  unreadCount,
  recentNotifications,
  emailUnreadCount,
  banner,
  children,
}: {
  user: AuthUser;
  unreadCount: number;
  recentNotifications: NotificationRow[];
  emailUnreadCount: number;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;
  const initials = getInitials(user);
  const roleLabel = user.role
    .replace("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="app" data-sidebar={collapsed ? "icons" : "full"}>
      {/* Desktop sidebar */}
      <aside className="side hidden md:flex">
        <div className="side-hd">
          <Link href="/" className="brand-mark" aria-label="Roof-Aid home">
            <BrandMark size={16} />
          </Link>
          {!collapsed && (
            <Link
              href="/"
              className="brand-name"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              Roof-Aid<small>CRM</small>
            </Link>
          )}
          <button
            type="button"
            className="side-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                !collapsed && "rotate-180",
              )}
            />
          </button>
        </div>
        <SidebarNav
          role={user.role}
          collapsed={collapsed}
          emailUnreadCount={emailUnreadCount}
        />
        <div className="side-foot">
          <ThemeToggle collapsed={collapsed} />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
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
                <SheetTitle className="text-left">
                  <Link
                    href="/"
                    onClick={() => setMobileOpen(false)}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    Roof-Aid
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <div className="flex h-[calc(100%-3.75rem)] flex-col">
                <SidebarNav
                  role={user.role}
                  emailUnreadCount={emailUnreadCount}
                  onNavigate={() => setMobileOpen(false)}
                />
                <div className="border-t p-2">
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="crumb">
            <b>{roleLabel}</b>
          </div>
          <div className="status-pill hidden sm:inline-flex">
            <span className="dot" />
            Ready
          </div>

          <div className="topbar-right">
            <NotificationBell
              userId={user.id}
              initialCount={unreadCount}
              initialNotifications={recentNotifications}
            />
            <button type="button" className="user-chip" aria-label={displayName}>
              <span className="avatar">{initials}</span>
              <span className="hidden md:inline-block">{displayName}</span>
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => startTransition(() => signOut())}
              disabled={isPending}
              aria-label="Sign out"
              title="Sign out"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        <Softphone />

        {banner}

        <main className="page">
          <div className="px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
