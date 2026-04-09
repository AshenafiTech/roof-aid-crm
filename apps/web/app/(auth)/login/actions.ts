"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type LoginResult = {
  error: string | null;
};

export async function login(
  email: string,
  password: string,
  redirectTo?: string
): Promise<LoginResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Map Supabase error messages to user-friendly ones
    if (error.message === "Invalid login credentials") {
      return { error: "Invalid email or password. Please try again." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Please verify your email address before signing in." };
    }
    if (error.status === 429) {
      return { error: "Too many login attempts. Please wait a moment and try again." };
    }
    return { error: "Something went wrong. Please try again later." };
  }

  // Redirect after successful login — use the `next` param or default to dashboard
  redirect(redirectTo || "/");
}
