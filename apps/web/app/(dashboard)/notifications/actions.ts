"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

const markReadSchema = z.object({
  id: z.string().uuid(),
});

export async function markAsRead(input: z.infer<typeof markReadSchema>) {
  const parsed = markReadSchema.parse(input);
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", parsed.id)
    .eq("user_id", userId);

  if (error) throw error;

  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function markAllAsRead() {
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;

  revalidatePath("/notifications");
  revalidatePath("/");
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteNotification(
  input: z.infer<typeof deleteSchema>,
) {
  const parsed = deleteSchema.parse(input);
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", parsed.id)
    .eq("user_id", userId);

  if (error) throw error;

  revalidatePath("/notifications");
  revalidatePath("/");
}
