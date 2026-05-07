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
  console.log("[login] start", {
    email,
    redirectTo,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });

  let supabase;
  try {
    supabase = await createClient();
    console.log("[login] supabase client created");
  } catch (err) {
    console.error("[login] createClient threw", err);
    return { error: "Auth client could not be initialized. See server logs." };
  }

  const startedAt = Date.now();
  let signInResult;
  try {
    signInResult = await supabase.auth.signInWithPassword({ email, password });
    console.log("[login] signInWithPassword returned", {
      ms: Date.now() - startedAt,
      hasUser: !!signInResult.data?.user,
      hasSession: !!signInResult.data?.session,
      errorMessage: signInResult.error?.message ?? null,
      errorStatus: signInResult.error?.status ?? null,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: unknown; code?: string };
    console.error("[login] signInWithPassword threw", {
      ms: Date.now() - startedAt,
      name: e?.name,
      message: e?.message,
      code: e?.code,
      cause: e?.cause,
    });
    return {
      error: `Network error reaching auth server (${e?.message ?? "unknown"}). See server logs.`,
    };
  }

  const { error } = signInResult;

  if (error) {
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

  console.log("[login] success — redirecting", { to: redirectTo || "/" });
  redirect(redirectTo || "/");
}
