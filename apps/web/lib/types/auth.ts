export type UserRole = "super_admin" | "owner" | "admin" | "telefonista" | "rufero";

/**
 * Authenticated user profile — sourced from the `users` table + JWT metadata.
 * This is the shape available throughout the dashboard via getCurrentUser().
 */
export type AuthUser = {
  id: string;
  tenantId: string;
  role: UserRole;
  roleId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
  /** Denormalized privilege slugs the user effectively has. */
  privileges: string[];
  /** When true, every privilege check returns true (Owner / Super Admin). */
  isSuperRole: boolean;
};

export type PrivilegeSlug = string;
