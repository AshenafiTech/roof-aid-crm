"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/auth";

import {
  NAV_ITEMS,
  filterNavForRole,
  isRouteActive,
  type NavItem,
} from "./nav-items";

type Props = {
  role: UserRole;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarNav({ role, collapsed = false, onNavigate }: Props) {
  const pathname = usePathname();
  const items = filterNavForRole(NAV_ITEMS, role);
  const main = items.filter((i) => i.section === "main");
  const admin = items.filter((i) => i.section === "admin");

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-2 py-4 text-sm">
      <Section
        label="Main"
        items={main}
        pathname={pathname}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {admin.length > 0 && (
        <Section
          label="Admin"
          items={admin}
          pathname={pathname}
          collapsed={collapsed}
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
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      {!collapsed && (
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  collapsed && "justify-center px-2",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
