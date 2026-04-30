import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

let _client: SupabaseClient | null = null

/** Service-role client for use inside Edge Functions. Bypasses RLS. */
export function adminClient(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return _client
}
