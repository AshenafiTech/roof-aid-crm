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
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AuthUser, UserRole } from "@/lib/types/auth";
import { hasAnyPrivilege } from "@/lib/auth/privileges";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Legacy role list. Used when `privileges` is not set, AND as the source
   * of truth for the brand-new tenant where role_id may still be null on
   * super_admins. New nav items should prefer `privileges`.
   */
  roles?: UserRole[];
  /**
   * Privilege slugs that gate visibility. The item shows if the user has
   * **any** of these (or is a super-role).
   */
  privileges?: string[];
  section: "main" | "tools" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "telefonista", "rufero"],
    section: "main",
  },
  {
    label: "All Leads",
    href: "/all-leads",
    icon: Layers,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "New Leads",
    href: "/new-leads",
    icon: Sparkles,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Prospects",
    href: "/prospects",
    icon: Users,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Contacted",
    href: "/contacted",
    icon: PhoneCall,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Follow Up",
    href: "/follow-up",
    icon: Clock,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Appointments",
    href: "/appointments",
    icon: Calendar,
    privileges: ["view_appointments"],
    section: "main",
  },
  {
    label: "Closed Customers",
    href: "/closed-customers",
    icon: CheckCircle2,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Not Viable",
    href: "/not-viable",
    icon: Ban,
    privileges: ["view_prospects"],
    section: "main",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    privileges: ["view_documents"],
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
    privileges: ["use_softphone"],
    section: "tools",
  },
  {
    label: "SMS",
    href: "/sms",
    icon: MessageSquare,
    privileges: ["send_sms", "view_sms_logs"],
    section: "tools",
  },
  {
    label: "Quick Email",
    href: "/email",
    icon: Mail,
    privileges: ["send_email"],
    section: "tools",
  },

  {
    label: "Users",
    href: "/admin/users",
    icon: UserCog,
    privileges: ["manage_users"],
    section: "admin",
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    privileges: ["view_analytics"],
    section: "admin",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    privileges: ["access_settings"],
    section: "admin",
  },
  {
    label: "Roles & Privileges",
    href: "/admin/settings/roles",
    icon: ShieldCheck,
    privileges: ["manage_roles"],
    section: "admin",
  },
];

/**
 * Filter nav items for the current user. Each item is visible if:
 *   - it has `privileges` AND the user has at least one of them (or is a
 *     super-role), OR
 *   - it has `roles` AND the user's role string matches.
 *
 * Items with neither are hidden by default (defensive — every nav item
 * should declare at least one gate).
 */
export function filterNavForUser(
  items: NavItem[],
  user: Pick<AuthUser, "role" | "privileges" | "isSuperRole">,
): NavItem[] {
  return items.filter((item) => {
    if (item.privileges && item.privileges.length > 0) {
      return hasAnyPrivilege(user, item.privileges);
    }
    if (item.roles && item.roles.length > 0) {
      return item.roles.includes(user.role);
    }
    return false;
  });
}

/** @deprecated Use `filterNavForUser` so privilege overrides take effect. */
export function filterNavForRole(items: NavItem[], role: UserRole) {
  return items.filter((item) => item.roles?.includes(role));
}

export function isRouteActive(
  pathname: string,
  href: string,
  allHrefs?: readonly string[],
) {
  if (href === "/") return pathname === "/";
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  // If a more specific nav href also matches, defer to it so that
  // e.g. `/admin/settings/roles` highlights "Roles & Privileges" only,
  // not "Settings".
  if (allHrefs) {
    for (const other of allHrefs) {
      if (other === href || other === "/") continue;
      if (other.length <= href.length) continue;
      if (pathname === other || pathname.startsWith(`${other}/`)) return false;
    }
  }
  return true;
}
