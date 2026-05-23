"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ────────────────────────────────────────────────────────────────────────────
// createAccount — called at the end of step 2 (after agreements accepted).
// Creates the tenant, the owner auth user, the users row, then signs the
// user in so the rest of the wizard (steps 3-6) runs while authenticated.
// ────────────────────────────────────────────────────────────────────────────

export type SelectedPlan =
  | "free"
  | "tier-1"
  | "tier-2"
  | "tier-3a"
  | "tier-3b"
  | "tier-3c";

const PLAN_TO_TIER: Record<SelectedPlan, number> = {
  free: 0,
  "tier-1": 1,
  "tier-2": 2,
  "tier-3a": 3,
  "tier-3b": 4,
  "tier-3c": 5,
};

const PLAN_LABEL: Record<SelectedPlan, string> = {
  free: "Free",
  "tier-1": "Tier 1 — CRM Core",
  "tier-2": "Tier 2 — CRM + More Volume",
  "tier-3a": "Tier 3A — + Telefonista",
  "tier-3b": "Tier 3B — AI Caller 24/7",
  "tier-3c": "Tier 3C — Telefonista + AI",
};

export type CreateAccountInput = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  state: string;
  password: string;
  plan: SelectedPlan;
  agreements: { dataOwnership: boolean; supplement: boolean; terms: boolean };
};

export type CreateAccountResult =
  | { ok: true; tenantId: string; userId: string; planLabel: string }
  | { ok: false; error: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function uniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  base: string,
): Promise<string> {
  const root = slugify(base) || "tenant";
  let candidate = root;
  for (let i = 0; i < 25; i++) {
    const { data } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Could not generate a unique tenant slug");
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<CreateAccountResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const companyName = input.companyName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const state = input.state.trim();
  const password = input.password;

  if (!firstName || !lastName || !companyName || !email || !phone || !state) {
    return { ok: false, error: "All fields are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!Object.prototype.hasOwnProperty.call(PLAN_TO_TIER, input.plan)) {
    return { ok: false, error: "Please pick a plan to continue." };
  }
  if (
    !input.agreements?.dataOwnership ||
    !input.agreements?.supplement ||
    !input.agreements?.terms
  ) {
    return { ok: false, error: "All three agreements must be accepted." };
  }

  const admin = createAdminClient();

  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) {
    return { ok: false, error: "An account with this email already exists." };
  }

  let slug: string;
  try {
    slug = await uniqueSlug(admin, companyName);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Slug generation failed.",
    };
  }

  const trialExpiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // "For now do not restrict anything" — every feature flag is enabled
  // regardless of selected plan_tier. When billing/gating is wired up
  // we'll switch this to a plan-derived map.
  const features = {
    crmCore: true,
    humanCalling: true,
    mobileApp: true,
    leads: true,
    aiCaller: true,
    supplements: true,
    supplementCommission: true,
    computerVision: true,
    advancedAnalytics: true,
    apiAccess: true,
    whiteLabel: true,
  };

  const settings = {
    state,
    selected_plan: input.plan,
    agreements: {
      data_ownership_accepted_at: new Date().toISOString(),
      supplement_accepted_at: new Date().toISOString(),
      terms_accepted_at: new Date().toISOString(),
    },
  };

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: companyName,
      slug,
      plan_tier: PLAN_TO_TIER[input.plan],
      trial_expires_at: trialExpiresAt,
      features,
      settings,
    })
    .select("id")
    .single();

  if (tenantErr || !tenant) {
    return {
      ok: false,
      error: `Could not create workspace (${tenantErr?.message ?? "unknown"}).`,
    };
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { tenant_id: tenant.id, role: "owner" },
  });

  if (authErr || !authData.user) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, error: authErr?.message ?? "Could not create account." };
  }

  const { error: userInsertErr } = await admin.from("users").insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    role: "owner",
    email,
    first_name: firstName,
    last_name: lastName,
    phone,
  });

  if (userInsertErr) {
    await admin.auth.admin.deleteUser(authData.user.id);
    await admin.from("tenants").delete().eq("id", tenant.id);
    return {
      ok: false,
      error: `Could not finalize account (${userInsertErr.message}).`,
    };
  }

  // Sign in via the cookie-bound server client so the rest of the wizard
  // (steps 3-6) runs authenticated. signInWithPassword sets the auth
  // cookie via the cookie adapter wired in createClient().
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    // Auth user exists; the wizard will land them on /login on next reload.
    return {
      ok: false,
      error:
        "Account created but automatic sign-in failed. Try logging in from the login page.",
    };
  }

  return {
    ok: true,
    tenantId: tenant.id,
    userId: authData.user.id,
    planLabel: PLAN_LABEL[input.plan],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// saveCompanyProfile — step 3. Stores address / license / website in the
// tenant's settings JSONB (no schema migration needed).
// ────────────────────────────────────────────────────────────────────────────

export type CompanyProfileInput = {
  address: string;
  licenseNumber: string;
  website: string;
};

export type CompanyProfileResult = { ok: true } | { ok: false; error: string };

export async function saveCompanyProfile(
  input: CompanyProfileInput,
): Promise<CompanyProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile) {
    return { ok: false, error: "Could not load your tenant." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("tenants")
    .select("settings")
    .eq("id", profile.tenant_id)
    .single();

  const merged = {
    ...((existing?.settings as Record<string, unknown>) ?? {}),
    address: input.address.trim() || null,
    license_number: input.licenseNumber.trim() || null,
    website: input.website.trim() || null,
    profile_completed_at: new Date().toISOString(),
  };

  const { error: updateErr } = await admin
    .from("tenants")
    .update({ settings: merged })
    .eq("id", profile.tenant_id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }
  return { ok: true };
}
