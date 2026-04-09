export type UserRole = "super_admin" | "owner" | "admin" | "telefonista" | "rufero";

/**
 * Authenticated user profile — sourced from the `users` table + JWT metadata.
 * This is the shape available throughout the dashboard via useUser().
 */
export type AuthUser = {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
};
