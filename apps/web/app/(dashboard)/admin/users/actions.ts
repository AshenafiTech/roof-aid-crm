"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege } from "@/lib/auth/privileges";
import { withRoles } from "@/lib/supabase/roles-augment";
import type { UserRole } from "@/lib/types/auth";

const MANAGEABLE_ROLES: UserRole[] = ["admin", "telefonista", "rufero"];

/**
 * Look up the role_id for the given (tenant, slug) pair. Returns null
 * if the role doesn't exist (e.g., super_admin which has no tenant row).
 */
async function lookupRoleId(
  tenantId: string,
  slug: string,
): Promise<string | null> {
  const supabase = await createClient();
  const ext = withRoles(supabase);
  const { data } = await ext
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

async function requireUserMgmt() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("Profile not found");

  const currentUser = await getCurrentUser();
  if (!hasPrivilege(currentUser, "manage_users")) {
    throw new Error("You don't have permission to manage users");
  }

  return { supabase, profile, currentUser };
}

export async function listTenantUsers() {
  const { supabase } = await requireUserMgmt();
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, phone, role, is_active, telnyx_extension, sendgrid_sender, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type TenantUser = Awaited<ReturnType<typeof listTenantUsers>>[number];

const inviteSchema = z.object({
  email: z.string().trim().email().max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "telefonista", "rufero"]),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  telnyxExtension: z.string().trim().max(40).optional().or(z.literal("")),
});

export type InviteUserInput = z.infer<typeof inviteSchema>;

export type InviteUserResult =
  | { ok: true; id: string; tempPassword: string }
  | { ok: false; error: string };

export async function inviteUser(
  input: InviteUserInput,
): Promise<InviteUserResult> {
  const parsed = inviteSchema.parse(input);
  const { profile } = await requireUserMgmt();

  const admin = createAdminClient();

  const { data: existingAuth } = await admin
    .from("users")
    .select("id")
    .eq("email", parsed.email)
    .maybeSingle();

  if (existingAuth) {
    return { ok: false, error: "A user with this email already exists" };
  }

  const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      tenant_id: profile.tenant_id,
      role: parsed.role,
    },
  });

  if (authError) return { ok: false, error: authError.message };
  if (!authData.user) return { ok: false, error: "Failed to create auth user" };

  const newRoleId = await lookupRoleId(profile.tenant_id, parsed.role);

  const { error: insertError } = await admin.from("users").insert({
    id: authData.user.id,
    tenant_id: profile.tenant_id,
    role: parsed.role,
    // role_id is added in migration 038 and not yet in database.types.ts.
    ...(newRoleId ? { role_id: newRoleId } : {}),
    email: parsed.email,
    first_name: parsed.firstName,
    last_name: parsed.lastName,
    phone: parsed.phone?.trim() || null,
    telnyx_extension: parsed.telnyxExtension?.trim() || null,
    is_active: true,
  } as never);

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { ok: false, error: insertError.message };
  }

  await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.email,
  });

  revalidatePath("/admin/users");
  return { ok: true, id: authData.user.id, tempPassword };
}

const editSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "telefonista", "rufero"]).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  telnyxExtension: z.string().trim().max(40).optional().or(z.literal("")),
  sendgridSender: z.string().trim().max(200).optional().or(z.literal("")),
});

export type EditUserInput = z.infer<typeof editSchema>;

export async function editUser(input: EditUserInput) {
  const parsed = editSchema.parse(input);
  const { supabase, profile } = await requireUserMgmt();

  const { data: target, error: findError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", parsed.id)
    .single();
  if (findError || !target) throw new Error("User not found");

  if (target.role === "owner" && target.id !== profile.id) {
    throw new Error("Cannot edit another owner");
  }

  // If the role string changes, also resolve the matching role_id so the
  // privilege system stays in sync.
  let nextRoleId: string | null | undefined = undefined;
  if (parsed.role && target.role !== "owner") {
    nextRoleId = await lookupRoleId(profile.tenant_id, parsed.role);
  }

  const patch = {
    role: (parsed.role && target.role !== "owner") ? parsed.role : undefined,
    role_id: nextRoleId,
    first_name: parsed.firstName,
    last_name: parsed.lastName,
    phone: parsed.phone !== undefined ? (parsed.phone.trim() || null) : undefined,
    telnyx_extension: parsed.telnyxExtension !== undefined ? (parsed.telnyxExtension.trim() || null) : undefined,
    sendgrid_sender: parsed.sendgridSender !== undefined ? (parsed.sendgridSender.trim() || null) : undefined,
  };

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(cleanPatch).length === 0) return;

  const { error: updateError } = await supabase
    .from("users")
    .update(cleanPatch as never)
    .eq("id", parsed.id);
  if (updateError) throw updateError;

  if (parsed.role && target.role !== "owner") {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(parsed.id, {
      user_metadata: { role: parsed.role },
    });
  }

  revalidatePath("/admin/users");
}

const toggleActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleUserActive(input: z.infer<typeof toggleActiveSchema>) {
  const parsed = toggleActiveSchema.parse(input);
  const { supabase, profile } = await requireUserMgmt();

  if (parsed.id === profile.id) {
    throw new Error("You cannot deactivate yourself");
  }

  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", parsed.id)
    .single();
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("Cannot deactivate an owner");

  const { error } = await supabase
    .from("users")
    .update({ is_active: parsed.isActive })
    .eq("id", parsed.id);
  if (error) throw error;

  if (!parsed.isActive) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(parsed.id, {
      ban_duration: "876000h",
    });
  } else {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(parsed.id, {
      ban_duration: "none",
    });
  }

  revalidatePath("/admin/users");
}

/**
 * Generate a new temporary password for `userId` and overwrite the
 * stored hash via the Supabase admin API. Returns the plaintext password
 * to the caller exactly ONCE — it is not persisted anywhere and cannot
 * be retrieved later, since auth stores only a bcrypt hash.
 *
 * The owner cannot reset another owner's password; everyone else can be
 * reset by anyone with user-management privileges. The previous password
 * stops working immediately.
 */
export async function resetUserPassword(
  userId: string,
): Promise<{ email: string; tempPassword: string }> {
  z.string().uuid().parse(userId);
  const { supabase, profile } = await requireUserMgmt();

  const { data: target } = await supabase
    .from("users")
    .select("email, role")
    .eq("id", userId)
    .single();
  if (!target) throw new Error("User not found");
  if (target.role === "owner" && userId !== profile.id) {
    throw new Error("Cannot reset another owner's password");
  }

  const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
  return { email: target.email, tempPassword };
}

export async function deleteUser(userId: string) {
  z.string().uuid().parse(userId);
  const { supabase, profile, currentUser } = await requireUserMgmt();

  if (!hasPrivilege(currentUser, "delete_users")) {
    throw new Error("You don't have permission to delete users");
  }

  if (userId === profile.id) throw new Error("You cannot delete yourself");

  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("Cannot delete an owner");

  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .eq("id", userId);
  if (deleteError) throw deleteError;

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);

  revalidatePath("/admin/users");
}
