// Service-role Supabase client for Edge Functions.
// Used by webhooks/cron to read+write any table, bypassing RLS.
// Never import this from a request that originates from the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !key) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the Edge Function environment',
  )
}

export const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
