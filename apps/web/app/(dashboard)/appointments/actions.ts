"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canAssignProspects, canEditProspect } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications/create";
import type { UserRole } from "@/lib/types/auth";

import { humanReasonFor } from "@/lib/appointments/reasons";

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

// ---------------------------------------------------------------------------
// can_schedule / suggest_rufero_for_prospect — Stage 1 availability surface.
// Both calls go through SECURITY DEFINER RPCs that gate by auth.uid()'s tenant.
// ---------------------------------------------------------------------------

export type CanScheduleReason =
  | "ok"
  | "overlap"
  | "overlap_with_block"
  | "outside_working_hours"
  | "rufero_inactive"
  | "rufero_not_found"
  | "forbidden";

export type CanScheduleResult = {
  allowed: boolean;
  reason: CanScheduleReason;
  conflicting_appointment_id?: string;
  conflicting_block_id?: string;
};

const checkSchema = z.object({
  ruferoId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
});

export async function checkAvailability(
  input: z.infer<typeof checkSchema>,
): Promise<CanScheduleResult> {
  const parsed = checkSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("can_schedule", {
    p_rufero_id: parsed.ruferoId,
    p_slot_start: parsed.scheduledAt,
    p_duration_minutes: parsed.durationMinutes ?? 60,
  });

  if (error) {
    return { allowed: false, reason: "forbidden" };
  }
  return data as CanScheduleResult;
}

const suggestSchema = z.object({
  prospectId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
});

export type RuferoSuggestion = {
  rufero_id: string;
  display_name: string | null;
  distance_miles: number | null;
  can_schedule_result: CanScheduleResult;
};

export async function suggestRuferos(
  input: z.infer<typeof suggestSchema>,
): Promise<RuferoSuggestion[]> {
  const parsed = suggestSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: RuferoSuggestion[] | null;
      error: { message: string } | null;
    }>
  )("suggest_rufero_for_prospect", {
    p_prospect_id: parsed.prospectId,
    p_slot_start: parsed.scheduledAt,
    p_duration_minutes: parsed.durationMinutes ?? 60,
  });

  if (error) throw new Error(error.message);
  return data ?? [];
}

const createSchema = z.object({
  prospectId: z.string().uuid(),
  ruferoId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().max(2000).optional(),
  rescheduledFrom: z.string().uuid().optional(),
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

  // Server-side availability recheck — the dialog has the same check live,
  // but a slot can be taken between the live check and the save.
  const { data: verdict, error: rpcError } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: CanScheduleResult | null;
      error: { message: string } | null;
    }>
  )("can_schedule", {
    p_rufero_id: parsed.ruferoId,
    p_slot_start: parsed.scheduledAt,
    p_duration_minutes: parsed.durationMinutes ?? 60,
  });
  if (rpcError) throw new Error(rpcError.message);
  if (verdict && !verdict.allowed) {
    const err = new Error(
      humanReasonFor(verdict.reason),
    ) as Error & { code?: string };
    err.code = verdict.reason;
    throw err;
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
      ...(parsed.rescheduledFrom
        ? { rescheduled_from: parsed.rescheduledFrom }
        : {}),
    })
    .select("id")
    .single();
  if (insertError) {
    // 23P01 = exclusion constraint violation (Stage 1 EXCLUDE backstop).
    if (
      (insertError as { code?: string }).code === "23P01" ||
      /appointments_no_overlap/i.test(insertError.message ?? "")
    ) {
      const err = new Error(
        "Slot just got booked. Pick another time.",
      ) as Error & { code?: string };
      err.code = "overlap";
      throw err;
    }
    throw insertError;
  }
  if (!appointment) throw new Error("Failed to create appointment");

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

const transitionSchema = z.object({
  appointmentId: z.string().uuid(),
  to: z.enum([
    "confirmed",
    "cancelled",
    "completed",
    "no_show",
    "rescheduled",
  ]),
  reason: z.string().trim().max(500).optional(),
});

export type AppointmentTransitionInput = z.infer<typeof transitionSchema>;

export async function transitionAppointment(input: AppointmentTransitionInput) {
  const parsed = transitionSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  // Cast until database.types.ts is regenerated post-migration 026.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("transition_appointment", {
    p_appointment_id: parsed.appointmentId,
    p_to: parsed.to,
    p_reason: parsed.reason ?? null,
  });
  if (error) throw new Error(error.message);

  const envelope = data as
    | { ok: true }
    | { ok: false; error: { code: string; message: string } };

  if (!envelope.ok) {
    const err = new Error(envelope.error.message) as Error & { code?: string };
    err.code = envelope.error.code;
    throw err;
  }

  const { data: appt } = await supabase
    .from("appointments")
    .select("prospect_id")
    .eq("id", parsed.appointmentId)
    .single();

  revalidatePath("/appointments");
  if (appt?.prospect_id) {
    revalidatePath(`/prospects/${appt.prospect_id}`);
  }
}

// ---------------------------------------------------------------------------
// rescheduleAppointment — Stage 2 §3
// Marks the old row as `rescheduled` (releasing its EXCLUDE slot) and creates
// a new row with `rescheduled_from = old.id` via the normal createAppointment
// path so all validation + side effects apply.
// ---------------------------------------------------------------------------
const rescheduleSchema = z.object({
  oldAppointmentId: z.string().uuid(),
  newScheduledAt: z.string().datetime(),
  ruferoId: z.string().uuid(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().max(2000).optional(),
});

export async function rescheduleAppointment(
  input: z.infer<typeof rescheduleSchema>,
) {
  const parsed = rescheduleSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to reschedule appointments");
  }

  const { data: existing, error: existErr } = await supabase
    .from("appointments")
    .select("id, prospect_id, status, tenant_id, duration_minutes")
    .eq("id", parsed.oldAppointmentId)
    .single();
  if (existErr || !existing) throw new Error("Appointment not found");
  if (!["pending", "confirmed"].includes(existing.status ?? "")) {
    throw new Error("Only pending or confirmed appointments can be rescheduled");
  }

  // 1. Transition the old row to `rescheduled` via the RPC (releases slot).
  const { data: txData, error: txErr } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("transition_appointment", {
    p_appointment_id: parsed.oldAppointmentId,
    p_to: "rescheduled",
    p_reason: "Rescheduled to a new slot",
  });
  if (txErr) throw new Error(txErr.message);
  const envelope = txData as
    | { ok: true }
    | { ok: false; error: { code: string; message: string } };
  if (!envelope.ok) throw new Error(envelope.error.message);

  if (!existing.prospect_id) {
    throw new Error("Cannot reschedule appointment without a prospect");
  }

  // 2. Insert new appointment via normal path (which calls can_schedule).
  const created = await createAppointment({
    prospectId: existing.prospect_id,
    ruferoId: parsed.ruferoId,
    scheduledAt: parsed.newScheduledAt,
    durationMinutes: parsed.durationMinutes ?? existing.duration_minutes ?? 60,
    notes: parsed.notes,
    rescheduledFrom: parsed.oldAppointmentId,
  });

  revalidatePath("/appointments");
  revalidatePath(`/prospects/${existing.prospect_id}`);

  return { id: created.id };
}

// ---------------------------------------------------------------------------
// createAvailabilityBlock — Stage 2 §6.1
// Inserts a `busy` (or `available_extra`) block for a rufero. Admin/owner only.
// ---------------------------------------------------------------------------
const blockSchema = z.object({
  ruferoId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  kind: z.enum(["busy", "available_extra"]).default("busy"),
  reason: z.enum(["sick", "pto", "office", "personal", "other"]).optional(),
  notes: z.string().max(2000).optional(),
  recurrenceRule: z.string().max(500).optional(),
});

export async function createAvailabilityBlock(
  input: z.infer<typeof blockSchema>,
) {
  const parsed = blockSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!["admin", "owner", "super_admin"].includes(profile.role)) {
    throw new Error("Only admins can block rufero time");
  }

  if (new Date(parsed.endsAt).getTime() <= new Date(parsed.startsAt).getTime()) {
    throw new Error("End must be after start");
  }

  // database.types.ts not yet regenerated for rufero_availability_blocks.
  const { data, error } = await (
    supabase.from as unknown as (
      table: string,
    ) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { code?: string; message: string } | null;
          }>;
        };
      };
    }
  )("rufero_availability_blocks")
    .insert({
      tenant_id: profile.tenant_id,
      rufero_id: parsed.ruferoId,
      starts_at: parsed.startsAt,
      ends_at: parsed.endsAt,
      all_day: parsed.allDay ?? false,
      kind: parsed.kind,
      reason: parsed.reason ?? null,
      notes: parsed.notes?.trim() || null,
      recurrence_rule: parsed.recurrenceRule ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    if (
      (error as { code?: string }).code === "23P01" ||
      /availability_blocks_no_overlap/i.test(error.message ?? "")
    ) {
      throw new Error("Rufero already has a blocked range at this time");
    }
    throw error;
  }

  revalidatePath("/appointments");
  return { id: data!.id };
}

const deleteBlockSchema = z.object({
  blockId: z.string().uuid(),
});

export async function deleteAvailabilityBlock(
  input: z.infer<typeof deleteBlockSchema>,
) {
  const parsed = deleteBlockSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  const { error } = await (
    supabase.from as unknown as (
      table: string,
    ) => {
      delete: () => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )("rufero_availability_blocks")
    .delete()
    .eq("id", parsed.blockId);
  if (error) throw new Error(error.message);

  revalidatePath("/appointments");
}

// ---------------------------------------------------------------------------
// getAppointmentStatusHistory — small read helper for the side drawer.
// ---------------------------------------------------------------------------
export async function getAppointmentStatusHistory(appointmentId: string) {
  const { supabase } = await requireUserWithProfile();
  type HistoryRow = {
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    created_at: string;
    actor: { first_name: string | null; last_name: string | null } | null;
  };

  const { data, error } = await (
    supabase.from as unknown as (
      table: string,
    ) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (
              n: number,
            ) => Promise<{
              data: HistoryRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )("appointment_status_history")
    .select(
      "id, from_status, to_status, reason, created_at, actor:users!actor_id(first_name, last_name)",
    )
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoryRow[];
}
