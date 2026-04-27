"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const addNoteSchema = z.object({
  prospectId: z.string().uuid(),
  body: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export type AddNoteInput = z.infer<typeof addNoteSchema>;

export async function addNote(input: AddNoteInput) {
  const parsed = addNoteSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw new Error("Profile not found");

  const { error: noteError } = await supabase.from("notes").insert({
    prospect_id: parsed.prospectId,
    body: parsed.body,
    author_id: user.id,
    tenant_id: profile.tenant_id,
  });
  if (noteError) throw noteError;

  await supabase.from("activities").insert({
    tenant_id: profile.tenant_id,
    prospect_id: parsed.prospectId,
    user_id: user.id,
    type: "note_added",
    metadata: { preview: parsed.body.slice(0, 140) },
  });

  revalidatePath(`/prospects/${parsed.prospectId}`);
  revalidatePath("/prospects");
  revalidatePath("/new-leads");
  revalidatePath("/all-leads");
  revalidatePath("/contacted");
  revalidatePath("/follow-up");
  revalidatePath("/closed-customers");
  revalidatePath("/not-viable");
}
