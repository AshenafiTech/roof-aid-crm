import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, slug, ownerEmail, planTier = 1 } = await req.json()

    // Validate required fields
    if (!name || !slug || !ownerEmail) {
      return new Response(
        JSON.stringify({ error: 'name, slug, and ownerEmail are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Insert tenant
    const trialExpiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        plan_tier: planTier,
        trial_expires_at: trialExpiresAt,
      })
      .select()
      .single()

    if (tenantErr) {
      return new Response(
        JSON.stringify({ error: tenantErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Create auth user for owner
    const tempPassword = crypto.randomUUID()
    const { data: authUser, error: authErr } =
      await supabase.auth.admin.createUser({
        email: ownerEmail,
        password: tempPassword,
        user_metadata: { tenant_id: tenant.id, role: 'owner' },
        email_confirm: true,
      })

    if (authErr) {
      // Rollback: delete the tenant we just created
      await supabase.from('tenants').delete().eq('id', tenant.id)
      return new Response(
        JSON.stringify({ error: authErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Insert user record
    const { error: userErr } = await supabase.from('users').insert({
      id: authUser.user.id,
      tenant_id: tenant.id,
      email: ownerEmail,
      role: 'owner',
    })

    if (userErr) {
      // Rollback: delete auth user and tenant
      await supabase.auth.admin.deleteUser(authUser.user.id)
      await supabase.from('tenants').delete().eq('id', tenant.id)
      return new Response(
        JSON.stringify({ error: userErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Create Stripe customer (non-fatal if it fails)
    let stripeCustomerId: string | null = null
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })
        const customer = await stripe.customers.create({
          email: ownerEmail,
          name,
          metadata: { tenant_id: tenant.id },
        })
        stripeCustomerId = customer.id
        await supabase
          .from('tenants')
          .update({ stripe_customer_id: customer.id })
          .eq('id', tenant.id)
      } catch (e) {
        console.error('Stripe customer creation failed (non-fatal):', e)
      }
    }

    return new Response(
      JSON.stringify({
        tenant_id: tenant.id,
        owner_id: authUser.user.id,
        temp_password: tempPassword,
        trial_expires_at: trialExpiresAt,
        stripe_customer_id: stripeCustomerId,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
