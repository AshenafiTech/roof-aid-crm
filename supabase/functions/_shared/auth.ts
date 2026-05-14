// Resolve a user from a request `Authorization: Bearer <jwt>` header and
// return both the user profile and a service-role admin client.
//
// We use the admin client for actual reads/writes so we can stamp
// tenant_id ourselves (and so RLS doesn't fight us inside the function),
// but we always validate the JWT first and tenant-check rows against the
// caller's tenant.

import { admin } from './supabase-admin.ts'

export type AuthedUser = {
  id: string
  email: string | null
  tenant_id: string
  role: string
}

export type AuthResult =
  | { user: AuthedUser; supabase: typeof admin }
  | { error: Response }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonError(status: number, code: string, message?: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message: message ?? code } }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function preflight(): Response {
  return new Response('ok', { headers: corsHeaders })
}

export async function getAuthedUser(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { error: jsonError(401, 'missing_token') }
  }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) {
    return { error: jsonError(401, 'invalid_token', error?.message) }
  }

  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id, email, tenant_id, role')
    .eq('id', data.user.id)
    .single()
  if (profileErr || !profile) {
    return { error: jsonError(401, 'profile_not_found') }
  }

  return {
    user: {
      id: profile.id,
      email: profile.email ?? data.user.email ?? null,
      tenant_id: profile.tenant_id,
      role: profile.role,
    },
    supabase: admin,
  }
}

export { corsHeaders }
