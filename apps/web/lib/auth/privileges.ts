import type { AuthUser, PrivilegeSlug } from "@/lib/types/auth";

/**
 * Returns true if the user effectively has the named privilege.
 * Super-roles (Owner, Super Admin) always return true.
 */
export function hasPrivilege(
  user: Pick<AuthUser, "privileges" | "isSuperRole">,
  slug: PrivilegeSlug,
): boolean {
  if (user.isSuperRole) return true;
  return user.privileges.includes(slug);
}

/**
 * Returns true if the user has every privilege in the list.
 */
export function hasAllPrivileges(
  user: Pick<AuthUser, "privileges" | "isSuperRole">,
  slugs: readonly PrivilegeSlug[],
): boolean {
  if (user.isSuperRole) return true;
  return slugs.every((s) => user.privileges.includes(s));
}

/**
 * Returns true if the user has any one of the named privileges.
 */
export function hasAnyPrivilege(
  user: Pick<AuthUser, "privileges" | "isSuperRole">,
  slugs: readonly PrivilegeSlug[],
): boolean {
  if (user.isSuperRole) return true;
  return slugs.some((s) => user.privileges.includes(s));
}

/**
 * Throws if the user is missing the named privilege. Use at the top of
 * server actions:
 *
 *   const user = await getCurrentUser();
 *   requirePrivilege(user, "delete_documents");
 */
export function requirePrivilege(
  user: Pick<AuthUser, "privileges" | "isSuperRole">,
  slug: PrivilegeSlug,
): void {
  if (!hasPrivilege(user, slug)) {
    throw new Error(`Missing privilege: ${slug}`);
  }
}

/**
 * Same as requirePrivilege but accepts any-of semantics.
 */
export function requireAnyPrivilege(
  user: Pick<AuthUser, "privileges" | "isSuperRole">,
  slugs: readonly PrivilegeSlug[],
): void {
  if (!hasAnyPrivilege(user, slugs)) {
    throw new Error(`Missing privileges (need one of): ${slugs.join(", ")}`);
  }
}
