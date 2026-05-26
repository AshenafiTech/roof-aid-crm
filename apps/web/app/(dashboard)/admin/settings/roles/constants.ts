/**
 * Privileges reserved for the Owner role. The Roles UI refuses to grant
 * these to any other role; the server actions enforce the same constraint
 * server-side. Keep this list in sync with the OWNER_ONLY_PRIVILEGES set
 * inside `actions.ts`.
 */
export const OWNER_ONLY_PRIVILEGE_LIST = [
  "manage_roles",
  "manage_billing",
] as const;

/** System role slugs — present on every tenant, not deletable. */
export const SYSTEM_ROLE_SLUGS = [
  "owner",
  "admin",
  "telefonista",
  "rufero",
] as const;
