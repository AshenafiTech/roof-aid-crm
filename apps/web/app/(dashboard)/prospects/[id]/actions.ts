"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canAssignProspects, canTransition } from "@/lib/auth/permissions";
import {
  PROSPECT_STATUSES,
  isProspectStatus,
} from "@/lib/constants/prospect-status";
import type { UserRole } from "@/lib/types/auth";

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

  revalidatePath(`/prospects/${parsed.id}`);
  revalidatePath("/prospects");
}
