/**
 * Reads a Supabase Edge Function secret. These are populated via:
 *
 *   supabase secrets set NAME=value
 *
 * (or via Dashboard → Edge Functions → Secrets). At runtime they're
 * exposed as plain `Deno.env` variables — same API as a regular env
 * var, but managed centrally by Supabase and applied to every deployed
 * function automatically.
 *
 * We don't put these in `.env` files: those get committed by accident,
 * shipped in build artifacts, and offer no rotation story. Edge
 * Function secrets are the right place for Telnyx / SendGrid keys.
 */
export function getSecret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(
      `Missing Edge Function secret: ${name}. ` +
        `Run \`supabase secrets set ${name}=<value>\` to set it.`,
    )
  }
  return value
}
