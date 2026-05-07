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
  const tools = items.filter((i) => i.section === "tools");
  const admin = items.filter((i) => i.section === "admin");

  return (
    <nav className="nav">
      <Section
        label="Main"
        items={main}
        pathname={pathname}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {tools.length > 0 && (
        <Section
          label="Tools"
          items={tools}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      )}
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
    <div>
      <div className="nav-group-label">{label}</div>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isRouteActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn("nav-item", active && "active")}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
