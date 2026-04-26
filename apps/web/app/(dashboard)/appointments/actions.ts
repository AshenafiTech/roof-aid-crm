"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canAssignProspects, canEditProspect } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications/create";
import type { UserRole } from "@/lib/types/auth";

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

const assignSchema = z.object({
  appointmentId: z.string().uuid(),
  ruferoId: z.string().uuid(),
});

export async function assignAppointmentRufero(
  input: z.infer<typeof assignSchema>,
) {
  const parsed = assignSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canAssignProspects(profile.role as UserRole)) {
    throw new Error("You don't have permission to reassign appointments");
  }

  const { data: current, error: currentError } = await supabase
    .from("appointments")
    .select("id, rufero_id, prospect_id, scheduled_at")
    .eq("id", parsed.appointmentId)
    .single();
  if (currentError || !current) throw new Error("Appointment not found");
  if (current.rufero_id === parsed.ruferoId) return;

  const { error: updateError } = await supabase
    .from("appointments")
    .update({ rufero_id: parsed.ruferoId })
    .eq("id", parsed.appointmentId);
  if (updateError) throw updateError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: current.prospect_id,
    user_id: profile.id,
    type: "assignment",
    metadata: {
      from: current.rufero_id,
      to: parsed.ruferoId,
      appointment_id: parsed.appointmentId,
      kind: "appointment_rufero",
    },
  });

  if (parsed.ruferoId !== profile.id) {
    const { data: prospect } = await supabase
      .from("prospects")
      .select("name")
      .eq("id", current.prospect_id)
      .single();

    const when = new Date(current.scheduled_at).toLocaleString();
    await createNotification(supabase, {
      tenantId: profile.tenant_id,
      userId: parsed.ruferoId,
      type: "lead_assigned",
      title: "Appointment assigned to you",
      body: `Inspection for "${prospect?.name ?? "a prospect"}" on ${when}.`,
      relatedId: parsed.appointmentId,
      relatedType: "appointment",
    });
  }

  revalidatePath("/appointments");
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
  return (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[];
}

const createSchema = z.object({
  prospectId: z.string().uuid(),
  ruferoId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createAppointment(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to schedule appointments");
  }

  if (new Date(parsed.scheduledAt).getTime() <= Date.now()) {
    throw new Error("Appointment must be scheduled in the future");
  }

  const { data: prospect, error: prospectError } = await supabase
    .from("prospects")
    .select("id, name, status")
    .eq("id", parsed.prospectId)
    .single();
  if (prospectError || !prospect) throw new Error("Prospect not found");

  const { data: rufero, error: ruferoError } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", parsed.ruferoId)
    .single();
  if (ruferoError || !rufero) throw new Error("Rufero not found");
  if (rufero.role !== "rufero" || !rufero.is_active) {
    throw new Error("Selected user is not an active rufero");
  }

  const { data: appointment, error: insertError } = await supabase
    .from("appointments")
    .insert({
      tenant_id: profile.tenant_id,
      prospect_id: parsed.prospectId,
      rufero_id: parsed.ruferoId,
      created_by: profile.id,
      scheduled_at: parsed.scheduledAt,
      duration_minutes: parsed.durationMinutes ?? 60,
      status: "pending",
      notes: parsed.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (insertError || !appointment) throw insertError ?? new Error("Failed to create appointment");

  // Move the prospect into the scheduled bucket so the pipeline reflects reality.
  if (prospect.status !== "scheduled" && prospect.status !== "closed_customer") {
    await supabase
      .from("prospects")
      .update({ status: "scheduled" })
      .eq("id", parsed.prospectId);
  }

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.prospectId,
    user_id: profile.id,
    type: "appointment",
    metadata: {
      appointment_id: appointment.id,
      scheduled_at: parsed.scheduledAt,
      rufero_id: parsed.ruferoId,
      action: "created",
    },
  });

  if (parsed.ruferoId !== profile.id) {
    const when = new Date(parsed.scheduledAt).toLocaleString();
    await createNotification(supabase, {
      tenantId: profile.tenant_id,
      userId: parsed.ruferoId,
      type: "lead_assigned",
      title: "New appointment scheduled for you",
      body: `Inspection for "${prospect.name}" on ${when}.`,
      relatedId: appointment.id,
      relatedType: "appointment",
    });
  }

  revalidatePath("/appointments");
  revalidatePath("/prospects");
  revalidatePath(`/prospects/${parsed.prospectId}`);

  return { id: appointment.id };
}
