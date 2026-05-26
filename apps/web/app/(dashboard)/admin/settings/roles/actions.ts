"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePrivilege } from "@/lib/auth/privileges";
import { createClient } from "@/lib/supabase/server";
import { withRoles, type PrivilegeRow, type RoleRow } from "@/lib/supabase/roles-augment";

import { OWNER_ONLY_PRIVILEGE_LIST, SYSTEM_ROLE_SLUGS } from "./constants";

const OWNER_ONLY_PRIVILEGES = new Set<string>(OWNER_ONLY_PRIVILEGE_LIST);
const SYSTEM_SLUGS = new Set<string>(SYSTEM_ROLE_SLUGS);

export type RoleListItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_super_role: boolean;
  is_assignable: boolean;
  login_web: boolean;
  login_mobile: boolean;
  privilege_count: number;
  user_count: number;
};

export type PrivilegeListItem = PrivilegeRow;

export type RoleDetail = RoleRow & {
  granted_privileges: string[];
};

async function requireManageRoles() {
  const user = await getCurrentUser();
  requirePrivilege(user, "manage_roles");
  const supabase = await createClient();
  return { user, supabase, ext: withRoles(supabase) };
}

/* ── Read ─────────────────────────────────────────────────────────────── */

export async function listRoles(): Promise<RoleListItem[]> {
  const user = await getCurrentUser();
  // Anyone in the tenant can read role definitions (so the User Mgmt
  // dropdown can render). Edit is what requires manage_roles.
  const supabase = await createClient();
  const ext = withRoles(supabase);

  const { data: roles, error } = await ext
    .from("roles")
    .select(
      "id, slug, name, description, is_system, is_super_role, is_assignable, login_web, login_mobile, privileges_cache",
    )
    .eq("tenant_id", user.tenantId)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;

  // Count users per role for display.
  const ids = (roles ?? []).map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: userRoleRows } = await ext
      .from("users")
      .select("role_id" as never)
      .eq("tenant_id", user.tenantId)
      .in("role_id" as never, ids as never);
    for (const row of (userRoleRows as { role_id: string | null }[] | null) ?? []) {
      if (row.role_id) {
        counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1);
      }
    }
  }

  return (roles ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    is_system: r.is_system,
    is_super_role: r.is_super_role,
    is_assignable: r.is_assignable,
    login_web: r.login_web,
    login_mobile: r.login_mobile,
    privilege_count: r.is_super_role ? -1 : (r.privileges_cache?.length ?? 0),
    user_count: counts.get(r.id) ?? 0,
  }));
}

export async function listPrivileges(): Promise<PrivilegeListItem[]> {
  await getCurrentUser();
  const supabase = await createClient();
  const ext = withRoles(supabase);
  const { data, error } = await ext
    .from("privileges")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PrivilegeListItem[];
}

export async function getRole(id: string): Promise<RoleDetail | null> {
  z.string().uuid().parse(id);
  const user = await getCurrentUser();
  const supabase = await createClient();
  const ext = withRoles(supabase);

  const { data: role, error } = await ext
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (error || !role) return null;

  const { data: grants } = await ext
    .from("role_privileges")
    .select("privilege_slug")
    .eq("role_id", id);

  const granted_privileges = (grants ?? []).map((g) => g.privilege_slug);
  return { ...role, granted_privileges };
}

/* ── Mutations ────────────────────────────────────────────────────────── */

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  login_web: z.boolean(),
  login_mobile: z.boolean(),
  cloneFromRoleId: z.string().uuid().optional(),
});

export async function createRole(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const { user, ext } = await requireManageRoles();

  const slug = parsed.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) + "_" + Math.random().toString(36).slice(2, 6);

  const { data: created, error } = await ext
    .from("roles")
    .insert({
      tenant_id: user.tenantId,
      slug,
      name: parsed.name,
      description: parsed.description?.trim() || null,
      is_system: false,
      is_super_role: false,
      is_assignable: true,
      login_web: parsed.login_web,
      login_mobile: parsed.login_mobile,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!created) throw new Error("Failed to create role");

  // Optional clone of an existing role's privilege grants.
  if (parsed.cloneFromRoleId) {
    const { data: source } = await ext
      .from("role_privileges")
      .select("privilege_slug")
      .eq("role_id", parsed.cloneFromRoleId);
    const rows = (source ?? [])
      .filter((p) => !OWNER_ONLY_PRIVILEGES.has(p.privilege_slug))
      .map((p) => ({ role_id: created.id, privilege_slug: p.privilege_slug }));
    if (rows.length > 0) {
      await ext.from("role_privileges").insert(rows);
    }
  }

  revalidatePath("/admin/settings/roles");
  return { id: created.id };
}

const updateMetaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  login_web: z.boolean().optional(),
  login_mobile: z.boolean().optional(),
});

export async function updateRoleMeta(input: z.infer<typeof updateMetaSchema>) {
  const parsed = updateMetaSchema.parse(input);
  const { user, ext } = await requireManageRoles();

  const { data: existing } = await ext
    .from("roles")
    .select("id, slug, is_system, is_super_role")
    .eq("id", parsed.id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!existing) throw new Error("Role not found");

  // System roles keep their name + description editable (it's just a label),
  // but their slug is frozen and we don't expose a rename action that
  // changes slug.
  const patch: Record<string, unknown> = {};
  if (parsed.name !== undefined && !existing.is_system) patch.name = parsed.name;
  if (parsed.name !== undefined && existing.is_system) {
    // For system roles, allow only the human label to change.
    patch.name = parsed.name;
  }
  if (parsed.description !== undefined) {
    patch.description = parsed.description.trim() || null;
  }
  if (parsed.login_web !== undefined) patch.login_web = parsed.login_web;
  if (parsed.login_mobile !== undefined) patch.login_mobile = parsed.login_mobile;

  if (Object.keys(patch).length === 0) return;

  const { error } = await ext
    .from("roles")
    .update(patch as never)
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings/roles");
  revalidatePath(`/admin/settings/roles/${parsed.id}`);
}

const togglePrivilegeSchema = z.object({
  roleId: z.string().uuid(),
  privilegeSlug: z.string().min(1).max(80),
  granted: z.boolean(),
});

export async function togglePrivilege(input: z.infer<typeof togglePrivilegeSchema>) {
  const parsed = togglePrivilegeSchema.parse(input);
  const { user, ext } = await requireManageRoles();

  const { data: role } = await ext
    .from("roles")
    .select("id, slug, is_system, is_super_role")
    .eq("id", parsed.roleId)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!role) throw new Error("Role not found");

  // The Owner role has all privileges by definition — block edits.
  if (role.is_super_role) {
    throw new Error("Owner role privileges cannot be edited (always all).");
  }

  // Owner-only privileges cannot be granted to any other role from the UI.
  if (parsed.granted && OWNER_ONLY_PRIVILEGES.has(parsed.privilegeSlug)) {
    throw new Error(
      `'${parsed.privilegeSlug}' is reserved for the Owner role and cannot be granted.`,
    );
  }

  if (parsed.granted) {
    const { error } = await ext.from("role_privileges").insert({
      role_id: parsed.roleId,
      privilege_slug: parsed.privilegeSlug,
    });
    // ignore unique-violation (already granted)
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  } else {
    const { error } = await ext
      .from("role_privileges")
      .delete()
      .eq("role_id", parsed.roleId)
      .eq("privilege_slug", parsed.privilegeSlug);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/admin/settings/roles/${parsed.roleId}`);
  revalidatePath("/admin/settings/roles");
}

const bulkSetSchema = z.object({
  roleId: z.string().uuid(),
  /** Full desired privilege set — server diffs against current grants. */
  grantedSlugs: z.array(z.string().min(1).max(80)).max(200),
});

export async function setRolePrivileges(input: z.infer<typeof bulkSetSchema>) {
  const parsed = bulkSetSchema.parse(input);
  const { user, ext } = await requireManageRoles();

  const { data: role } = await ext
    .from("roles")
    .select("id, is_super_role")
    .eq("id", parsed.roleId)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!role) throw new Error("Role not found");
  if (role.is_super_role) {
    throw new Error("Owner role privileges cannot be edited.");
  }

  const desired = new Set(
    parsed.grantedSlugs.filter((s) => !OWNER_ONLY_PRIVILEGES.has(s)),
  );

  const { data: current } = await ext
    .from("role_privileges")
    .select("privilege_slug")
    .eq("role_id", parsed.roleId);
  const currentSet = new Set((current ?? []).map((r) => r.privilege_slug));

  const toAdd: { role_id: string; privilege_slug: string }[] = [];
  const toRemove: string[] = [];
  for (const slug of desired) {
    if (!currentSet.has(slug)) toAdd.push({ role_id: parsed.roleId, privilege_slug: slug });
  }
  for (const slug of currentSet) {
    if (!desired.has(slug)) toRemove.push(slug);
  }

  if (toAdd.length > 0) {
    const { error } = await ext.from("role_privileges").insert(toAdd);
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    const { error } = await ext
      .from("role_privileges")
      .delete()
      .eq("role_id", parsed.roleId)
      .in("privilege_slug", toRemove);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/admin/settings/roles/${parsed.roleId}`);
  revalidatePath("/admin/settings/roles");
  return { added: toAdd.length, removed: toRemove.length };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteRole(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.parse(input);
  const { user, ext } = await requireManageRoles();

  const { data: role } = await ext
    .from("roles")
    .select("id, slug, is_system")
    .eq("id", parsed.id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!role) throw new Error("Role not found");
  if (role.is_system || SYSTEM_SLUGS.has(role.slug)) {
    throw new Error("System roles cannot be deleted.");
  }

  const { count } = await ext
    .from("users")
    .select("id" as never, { count: "exact", head: true })
    .eq("role_id" as never, parsed.id as never);
  if ((count ?? 0) > 0) {
    throw new Error(
      `${count} user${count === 1 ? "" : "s"} currently hold this role. Reassign them before deleting.`,
    );
  }

  const { error } = await ext.from("roles").delete().eq("id", parsed.id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings/roles");
}

