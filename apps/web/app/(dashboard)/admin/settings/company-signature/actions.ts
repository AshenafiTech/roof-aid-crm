"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types/auth";

const OWNER_ROLES: UserRole[] = ["owner", "admin", "super_admin"];

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, tenant_id, role, first_name, last_name, email")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("Profile not found");
  if (!OWNER_ROLES.includes(profile.role as UserRole)) {
    throw new Error("Only owners or admins can manage the company signature");
  }
  return { supabase, profile };
}

const savePngSchema = z.object({
  pngBase64: z.string().min(100),
  signerName: z.string().trim().min(1).max(120),
});

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/png;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// saveCompanySignature — stores the PNG in the `signatures` bucket at
//   signatures/{tenant_id}/company-signature.png
// and records the path + signer name on the tenants row.
// ---------------------------------------------------------------------------
export async function saveCompanySignature(input: z.infer<typeof savePngSchema>) {
  const parsed = savePngSchema.parse(input);
  const { supabase, profile } = await requireOwner();

  const bytes = base64ToBytes(parsed.pngBase64);
  if (bytes.length < 100) throw new Error("Signature image is too small");
  if (bytes.length > 1_000_000) throw new Error("Signature image is too large (max 1 MB)");

  const storagePath = `${profile.tenant_id}/company-signature.png`;
  // The signatures bucket RLS only has SELECT / INSERT / DELETE (no
  // UPDATE) and depends on the JWT's user_metadata.tenant_id. Owner
  // auth was already verified above against the users table, so we
  // bypass RLS with the service role for this write. The tenant
  // boundary is still enforced by the path construction.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("signatures")
    .upload(storagePath, bytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (upErr) throw new Error(upErr.message);

  // tenants RLS restricts UPDATE to super_admin. Owner/admin auth was
  // already validated against the users table above, so we bypass
  // RLS with the service role.
  const { error: updErr } = await admin
    .from("tenants")
    .update({
      company_signature_path: storagePath,
      company_signature_signer: parsed.signerName,
      company_signature_updated_at: new Date().toISOString(),
    })
    .eq("id", profile.tenant_id);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/settings/company-signature");
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// clearCompanySignature — removes the storage object and clears the
// tenants row. Documents already generated keep their stamped sig.
// ---------------------------------------------------------------------------
export async function clearCompanySignature() {
  const { supabase, profile } = await requireOwner();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("company_signature_path")
    .eq("id", profile.tenant_id)
    .single();

  const admin = createAdminClient();
  if (tenant?.company_signature_path) {
    // Same reason as save — bypass RLS for the cleanup. Path was
    // written by us so tenant scope is guaranteed.
    await admin.storage
      .from("signatures")
      .remove([tenant.company_signature_path]);
  }

  // tenants UPDATE is super_admin-only under RLS; use the admin
  // client since owner auth has already been validated.
  await admin
    .from("tenants")
    .update({
      company_signature_path: null,
      company_signature_signer: null,
      company_signature_updated_at: null,
    })
    .eq("id", profile.tenant_id);

  revalidatePath("/admin/settings/company-signature");
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// loadCompanySignature — used by the settings page to render the
// current state (preview URL + signer name + updated_at).
// ---------------------------------------------------------------------------
export async function loadCompanySignature(): Promise<{
  configured: boolean;
  signerName: string | null;
  updatedAt: string | null;
  previewUrl: string | null;
}> {
  const { supabase, profile } = await requireOwner();

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "company_signature_path, company_signature_signer, company_signature_updated_at",
    )
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant?.company_signature_path) {
    return {
      configured: false,
      signerName: null,
      updatedAt: null,
      previewUrl: null,
    };
  }

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("signatures")
    .createSignedUrl(tenant.company_signature_path, 60 * 60);

  return {
    configured: true,
    signerName: tenant.company_signature_signer,
    updatedAt: tenant.company_signature_updated_at,
    previewUrl: signed?.signedUrl ?? null,
  };
}
