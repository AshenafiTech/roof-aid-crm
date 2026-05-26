"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/types/auth";

import {
  NAV_ITEMS,
  filterNavForUser,
  isRouteActive,
  type NavItem,
} from "./nav-items";

type Props = {
  user: Pick<AuthUser, "role" | "privileges" | "isSuperRole">;
  collapsed?: boolean;
  emailUnreadCount?: number;
  onNavigate?: () => void;
};

export function SidebarNav({
  user,
  collapsed = false,
  emailUnreadCount = 0,
  onNavigate,
}: Props) {
  const pathname = usePathname();
  const items = filterNavForUser(NAV_ITEMS, user);
  const main = items.filter((i) => i.section === "main");
  const tools = items.filter((i) => i.section === "tools");
  const admin = items.filter((i) => i.section === "admin");
  const allHrefs = items.map((i) => i.href);

  const badgeFor = (href: string): number => {
    if (href === "/email") return emailUnreadCount;
    return 0;
  };

  return (
    <nav className="nav">
      <Section
        label="Main"
        items={main}
        pathname={pathname}
        allHrefs={allHrefs}
        collapsed={collapsed}
        badgeFor={badgeFor}
        onNavigate={onNavigate}
      />
      {tools.length > 0 && (
        <Section
          label="Tools"
          items={tools}
          pathname={pathname}
          allHrefs={allHrefs}
          collapsed={collapsed}
          badgeFor={badgeFor}
          onNavigate={onNavigate}
        />
      )}
      {admin.length > 0 && (
        <Section
          label="Admin"
          items={admin}
          pathname={pathname}
          allHrefs={allHrefs}
          collapsed={collapsed}
          badgeFor={badgeFor}
          onNavigate={onNavigate}
        />
      )}
    </nav>
  );
}

function Section({
  label,
  items,
  pathname,
  allHrefs,
  collapsed,
  badgeFor,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  allHrefs: readonly string[];
  collapsed: boolean;
  badgeFor: (href: string) => number;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <div className="nav-group-label">{label}</div>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isRouteActive(pathname, item.href, allHrefs);
        const badge = badgeFor(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={
              collapsed
                ? `${item.label}${badge > 0 ? ` (${badge} unread)` : ""}`
                : undefined
            }
            className={cn("nav-item", active && "active")}
          >
            <Icon />
            <span>{item.label}</span>
            {badge > 0 && (
              <span
                className={cn(
                  "ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground",
                  collapsed &&
                    "ml-0 absolute right-1 top-1 h-2.5 min-w-[0.625rem] px-0",
                )}
              >
                {collapsed ? "" : badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
