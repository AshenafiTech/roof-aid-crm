import {
  Ban,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  PhoneCall,
  Settings,
  Sparkles,
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
  section: "main" | "tools" | "admin";
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
    label: "All Leads",
    href: "/all-leads",
    icon: Layers,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "New Leads",
    href: "/new-leads",
    icon: Sparkles,
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
    label: "Contacted",
    href: "/contacted",
    icon: PhoneCall,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Follow Up",
    href: "/follow-up",
    icon: Clock,
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
    label: "Closed Customers",
    href: "/closed-customers",
    icon: CheckCircle2,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "Not Viable",
    href: "/not-viable",
    icon: Ban,
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
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },

  {
    label: "Phone",
    href: "/phone",
    icon: Phone,
    roles: ["owner", "admin", "telefonista"],
    section: "tools",
  },
  {
    label: "SMS",
    href: "/sms",
    icon: MessageSquare,
    roles: ["owner", "admin", "telefonista"],
    section: "tools",
  },
  {
    label: "Quick Email",
    href: "/email",
    icon: Mail,
    roles: ["owner", "admin", "telefonista"],
    section: "tools",
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
    roles: ["owner", "admin"],
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
