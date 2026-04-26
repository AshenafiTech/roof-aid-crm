"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canAssignProspects, canTransition } from "@/lib/auth/permissions";
import {
  PROSPECT_STATUSES,
  isProspectStatus,
  PROSPECT_STATUS_LABELS,
} from "@/lib/constants/prospect-status";
import type { UserRole } from "@/lib/types/auth";
import { createNotification } from "@/lib/notifications/create";

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal("")),
  hail_size: z.number().nullable().optional(),
  home_value: z.number().nullable().optional(),
});

export type UpdateProspectInput = z.infer<typeof updateSchema>;

async function requireUserWithProfile() {
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

  return { supabase, profile };
}

export async function updateProspect(input: UpdateProspectInput) {
  const parsed = updateSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  const { data: current, error: currentError } = await supabase
    .from("prospects")
    .select("name, phones, email, hail_size, home_value")
    .eq("id", parsed.id)
    .single();
  if (currentError || !current) throw new Error("Prospect not found");

  const nextPhones = parsed.phone ? [parsed.phone.trim()] : null;
  const nextEmail = parsed.email ? parsed.email.trim() : null;

  const patch = {
    name: parsed.name,
    phones: nextPhones,
    email: nextEmail,
    hail_size: parsed.hail_size ?? null,
    home_value: parsed.home_value ?? null,
  };

  const { error: updateError } = await supabase
    .from("prospects")
    .update(patch)
    .eq("id", parsed.id);
  if (updateError) throw updateError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.id,
    user_id: profile.id,
    type: "prospect_update",
    metadata: {
      before: {
        name: current.name,
        phones: current.phones,
        email: current.email,
        hail_size: current.hail_size,
        home_value: current.home_value,
      },
      after: patch,
    },
  });

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath("/prospects");
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(PROSPECT_STATUSES),
  followUpNote: z.string().trim().min(1).max(5000).optional(),
});

export async function changeStatus(input: z.infer<typeof statusSchema>) {
  const parsed = statusSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  const { data: current, error: currentError } = await supabase
    .from("prospects")
    .select("status")
    .eq("id", parsed.id)
    .single();
  if (currentError || !current) throw new Error("Prospect not found");

  const from = isProspectStatus(current.status) ? current.status : null;

  if (!canTransition(profile.role as UserRole, from, parsed.status)) {
    throw new Error("You don't have permission to make this status change");
  }

  const { error: updateError } = await supabase
    .from("prospects")
    .update({ status: parsed.status })
    .eq("id", parsed.id);
  if (updateError) throw updateError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.id,
    user_id: profile.id,
    type: "status_change",
    metadata: { from, to: parsed.status },
  });

  if (parsed.status === "follow_up" && parsed.followUpNote) {
    const body = parsed.followUpNote;
    const { error: noteError } = await supabase.from("notes").insert({
      tenant_id: profile.tenant_id,
      prospect_id: parsed.id,
      author_id: profile.id,
      body,
    });
    if (noteError) throw noteError;

    await supabase.from("activities").insert({
      tenant_id: profile.tenant_id,
      prospect_id: parsed.id,
      user_id: profile.id,
      type: "note_added",
      metadata: {
        preview: body.slice(0, 140),
        source: "follow_up_status_change",
      },
    });
  }

  // Notify the assigned user about the status change (if someone else is assigned)
  const { data: prospect } = await supabase
    .from("prospects")
    .select("assigned_to, name")
    .eq("id", parsed.id)
    .single();

  if (prospect?.assigned_to && prospect.assigned_to !== profile.id) {
    const toLabel = PROSPECT_STATUS_LABELS[parsed.status] ?? parsed.status;
    await createNotification(supabase, {
      tenantId: profile.tenant_id,
      userId: prospect.assigned_to,
      type: "system_alert",
      title: `Status changed to "${toLabel}"`,
      body: `Prospect "${prospect.name}" status was updated.`,
      relatedId: parsed.id,
      relatedType: "prospect",
    });
  }

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath("/prospects");
}

const assignSchema = z.object({
  id: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
});

export async function assignProspect(input: z.infer<typeof assignSchema>) {
  const parsed = assignSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canAssignProspects(profile.role as UserRole)) {
    throw new Error("You don't have permission to reassign prospects");
  }

  const { data: current, error: currentError } = await supabase
    .from("prospects")
    .select("assigned_to")
    .eq("id", parsed.id)
    .single();
  if (currentError || !current) throw new Error("Prospect not found");

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("prospects")
    .update({
      assigned_to: parsed.assignedTo,
      assigned_by: parsed.assignedTo ? profile.id : null,
      assigned_at: parsed.assignedTo ? now : null,
    })
    .eq("id", parsed.id);
  if (updateError) throw updateError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.id,
    user_id: profile.id,
    type: "assignment",
    metadata: {
      from: current.assigned_to,
      to: parsed.assignedTo,
    },
  });

  // Notify the newly assigned user
  if (parsed.assignedTo && parsed.assignedTo !== profile.id) {
    const { data: prospect } = await supabase
      .from("prospects")
      .select("name")
      .eq("id", parsed.id)
      .single();

    await createNotification(supabase, {
      tenantId: profile.tenant_id,
      userId: parsed.assignedTo,
      type: "lead_assigned",
      title: "New prospect assigned to you",
      body: `You have been assigned "${prospect?.name ?? "a prospect"}".`,
      relatedId: parsed.id,
      relatedType: "prospect",
    });
  }

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath("/prospects");
}

/* ── Bulk actions ── */

const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  assignedTo: z.string().uuid().nullable(),
});

export async function bulkAssign(input: z.infer<typeof bulkAssignSchema>) {
  const parsed = bulkAssignSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canAssignProspects(profile.role as UserRole)) {
    throw new Error("You don't have permission to reassign prospects");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("prospects")
    .update({
      assigned_to: parsed.assignedTo,
      assigned_by: parsed.assignedTo ? profile.id : null,
      assigned_at: parsed.assignedTo ? now : null,
    })
    .in("id", parsed.ids);
  if (error) throw error;

  await supabase.from("activities").insert(
    parsed.ids.map((id) => ({
      tenant_id: profile.tenant_id,
      prospect_id: id,
      user_id: profile.id,
      type: "assignment" as const,
      metadata: { to: parsed.assignedTo, bulk: true },
    })),
  );

  revalidatePath("/prospects");
  return { count: parsed.ids.length };
}

const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(PROSPECT_STATUSES),
});

export async function bulkChangeStatus(input: z.infer<typeof bulkStatusSchema>) {
  const parsed = bulkStatusSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  const { error } = await supabase
    .from("prospects")
    .update({ status: parsed.status })
    .in("id", parsed.ids);
  if (error) throw error;

  await supabase.from("activities").insert(
    parsed.ids.map((id) => ({
      tenant_id: profile.tenant_id,
      prospect_id: id,
      user_id: profile.id,
      type: "status_change" as const,
      metadata: { to: parsed.status, bulk: true },
    })),
  );

  revalidatePath("/prospects");
  return { count: parsed.ids.length };
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function bulkDelete(input: z.infer<typeof bulkDeleteSchema>) {
  const parsed = bulkDeleteSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!["admin", "owner", "super_admin"].includes(profile.role)) {
    throw new Error("You don't have permission to delete prospects");
  }

  const { error } = await supabase
    .from("prospects")
    .delete()
    .in("id", parsed.ids);
  if (error) throw error;

  revalidatePath("/prospects");
  revalidatePath("/new-leads");
  revalidatePath("/");
  return { count: parsed.ids.length };
}

const bulkDncSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  doNotCall: z.boolean(),
});

export async function bulkToggleDnc(input: z.infer<typeof bulkDncSchema>) {
  const parsed = bulkDncSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  const patch = {
    do_not_call: parsed.doNotCall,
    do_not_call_at: parsed.doNotCall ? new Date().toISOString() : null,
    do_not_call_reason: parsed.doNotCall ? "Bulk DNC" : null,
  };

  const { error } = await supabase
    .from("prospects")
    .update(patch)
    .in("id", parsed.ids);
  if (error) throw error;

  await supabase.from("activities").insert(
    parsed.ids.map((id) => ({
      tenant_id: profile.tenant_id,
      prospect_id: id,
      user_id: profile.id,
      type: "dnc" as const,
      metadata: { do_not_call: parsed.doNotCall, bulk: true },
    })),
  );

  revalidatePath("/prospects");
  return { count: parsed.ids.length };
}

export async function listRuferos() {
  const { supabase } = await requireUserWithProfile();
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("role", "rufero")
    .eq("is_active", true)
    .order("first_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[];
}

const dncSchema = z.object({
  id: z.string().uuid(),
  doNotCall: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function toggleDoNotCall(input: z.infer<typeof dncSchema>) {
  const parsed = dncSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  const patch = {
    do_not_call: parsed.doNotCall,
    do_not_call_reason: parsed.doNotCall ? (parsed.reason?.trim() || null) : null,
    do_not_call_at: parsed.doNotCall ? new Date().toISOString() : null,
  };

  const { error: updateError } = await supabase
    .from("prospects")
    .update(patch)
    .eq("id", parsed.id);
  if (updateError) throw updateError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.id,
    user_id: profile.id,
    type: "dnc",
    metadata: {
      do_not_call: parsed.doNotCall,
      reason: parsed.reason?.trim() || null,
    },
  });

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath("/prospects");
  revalidatePath("/");
}
