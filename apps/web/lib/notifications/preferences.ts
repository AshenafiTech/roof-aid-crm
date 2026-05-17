"use server";

import { createClient } from "@/lib/supabase/server";

export type NotificationPreferences = {
  emailNewMessage: boolean;
};

const DEFAULTS: NotificationPreferences = {
  emailNewMessage: true,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULTS;

  const { data } = await supabase
    .from("notification_preferences")
    .select("email_new_message")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return DEFAULTS;
  return { emailNewMessage: data.email_new_message };
}

export type UpdatePreferencesResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; error: string };

export async function updateNotificationPreferences(input: {
  emailNewMessage: boolean;
}): Promise<UpdatePreferencesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: user.id,
        email_new_message: input.emailNewMessage,
      },
      { onConflict: "user_id" },
    );

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    preferences: { emailNewMessage: input.emailNewMessage },
  };
}
