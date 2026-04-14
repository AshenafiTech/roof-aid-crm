import {
  BarChart3,
  Calendar,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/types/auth";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  section: "main" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Prospects",
    href: "/prospects",
    icon: Users,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Appointments",
    href: "/appointments",
    icon: Calendar,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Communications",
    href: "/communications",
    icon: MessageSquare,
    roles: ["owner", "admin", "telefonista"],
    section: "main",
  },

  {
    label: "Users",
    href: "/admin/users",
    icon: UserCog,
    roles: ["owner", "admin"],
    section: "admin",
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    roles: ["owner", "admin"],
    section: "admin",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    roles: ["owner"],
    section: "admin",
  },
];

export function filterNavForRole(items: NavItem[], role: UserRole) {
  return items.filter((item) => item.roles.includes(role));
}

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
