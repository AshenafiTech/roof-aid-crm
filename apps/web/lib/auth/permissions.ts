import type { UserRole } from "@/lib/types/auth";
import type { ProspectStatus } from "@/lib/constants/prospect-status";

export function canAssignProspects(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "super_admin";
}

export function canEditProspect(role: UserRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "telefonista" ||
    role === "super_admin"
  );
}

export function canManageUsers(role: UserRole): boolean {
  return role === "owner" || role === "super_admin";
}

export function canTransition(
  role: UserRole,
  from: ProspectStatus | null,
  to: ProspectStatus,
): boolean {
  if (role === "owner" || role === "admin" || role === "super_admin") {
    return true;
  }

  if (role === "rufero") {
    return from === "scheduled" && (to === "closed_customer" || to === "not_viable");
  }

  if (role === "telefonista") {
    return from !== "not_viable";
  }

  return false;
}
