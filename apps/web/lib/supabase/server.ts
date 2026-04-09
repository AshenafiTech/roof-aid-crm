import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Creates a Supabase client for server-side usage (RSC, Server Actions, Route Handlers).
 *
 * Must be called per-request — never cache or store in a module-level variable,
 * because each request has its own cookie jar.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from Server Components where cookies can't be set.
            // This is expected when refreshing tokens from RSC — the middleware
            // handles the actual cookie writes on the response.
          }
        },
      },
    }
  );
}
