/**
 * Hand-written supplements to `database.types.ts` for the rows added in
 * migration 038 (roles, privileges, role_privileges, role_parents) and the
 * new `users.role_id` column. The generated types file will replace these
 * once `supabase gen types` is rerun against the post-038 schema.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type RoleRow = {
  id: string;
  tenant_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_super_role: boolean;
  is_assignable: boolean;
  login_web: boolean;
  login_mobile: boolean;
  privileges_cache: string[];
  cache_version: number;
  created_at: string;
  updated_at: string;
};

export type RoleInsert = {
  id?: string;
  tenant_id: string | null;
  slug: string;
  name: string;
  description?: string | null;
  is_system?: boolean;
  is_super_role?: boolean;
  is_assignable?: boolean;
  login_web?: boolean;
  login_mobile?: boolean;
};

export type RoleUpdate = Partial<RoleInsert> & {
  cache_version?: number;
};

export type PrivilegeRow = {
  slug: string;
  name: string;
  domain: string;
  description: string | null;
  is_platform_only: boolean;
  sort_order: number;
};

export type RolePrivilegeRow = {
  role_id: string;
  privilege_slug: string;
};

export type RoleParentRow = {
  child_role_id: string;
  parent_role_id: string;
};

/** Subset of role columns used when joined into a user query. */
export type JoinedRoleSummary = Pick<
  RoleRow,
  | "id"
  | "slug"
  | "name"
  | "is_super_role"
  | "privileges_cache"
  | "login_web"
  | "login_mobile"
>;

/* ── Database type extension ──────────────────────────────────────────── */

type ExtraTables = {
  roles: {
    Row: RoleRow;
    Insert: RoleInsert;
    Update: RoleUpdate;
    Relationships: [];
  };
  privileges: {
    Row: PrivilegeRow;
    Insert: PrivilegeRow;
    Update: Partial<PrivilegeRow>;
    Relationships: [];
  };
  role_privileges: {
    Row: RolePrivilegeRow;
    Insert: RolePrivilegeRow;
    Update: Partial<RolePrivilegeRow>;
    Relationships: [];
  };
  role_parents: {
    Row: RoleParentRow;
    Insert: RoleParentRow;
    Update: Partial<RoleParentRow>;
    Relationships: [];
  };
};

export type ExtendedDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & ExtraTables;
  };
};

/**
 * Casts a Supabase client to the extended type so calls against the new
 * tables (roles, privileges, role_privileges, role_parents) are typed.
 * Use at the call site:
 *
 *   const ext = withRoles(supabase);
 *   const { data } = await ext.from("roles").select(...);
 */
export function withRoles(
  client: SupabaseClient<Database>,
): SupabaseClient<ExtendedDatabase> {
  return client as unknown as SupabaseClient<ExtendedDatabase>;
}
