"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canEditProspect } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types/auth";

async function requireUserWithProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("Profile not found");

  return { supabase, profile };
}

const TEMPLATE_KINDS = [
  "3rd_party_auth",
  "acv_contract",
  "rcv_contract",
  "supplement",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

const createSchema = z.object({
  prospectId: z.string().uuid(),
  templateKind: z.enum(TEMPLATE_KINDS),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export async function createDocument(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to create documents");
  }

  // Invoke the generate-pdf Edge Function with the user's JWT — it enforces
  // role + tenant guards internally.
  const { data, error } = await supabase.functions.invoke("generate-pdf", {
    body: {
      prospect_id: parsed.prospectId,
      template_kind: parsed.templateKind,
      fields: parsed.fields ?? {},
    },
  });
  if (error) {
    throw new Error(error.message || "generate-pdf failed");
  }
  const document = (data as { document?: { id: string } } | null)?.document;
  if (!document?.id) {
    throw new Error("generate-pdf returned no document");
  }

  revalidatePath(`/prospects/${parsed.prospectId}`);
  revalidatePath("/documents");

  return { id: document.id };
}

const signedUrlSchema = z.object({
  documentId: z.string().uuid(),
  signed: z.boolean().optional(),
});

export async function getDocumentSignedUrl(
  input: z.infer<typeof signedUrlSchema>,
): Promise<{ url: string }> {
  const parsed = signedUrlSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("storage_path, signed_storage_path")
    .eq("id", parsed.documentId)
    .single();
  if (error || !doc) throw new Error("Document not found");

  const path =
    parsed.signed && doc.signed_storage_path
      ? doc.signed_storage_path
      : doc.storage_path;
  if (!path) throw new Error("Document has no file yet");

  const { data: signed, error: sErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 60 * 60);
  if (sErr || !signed?.signedUrl) {
    throw new Error(sErr?.message || "Failed to create signed URL");
  }
  return { url: signed.signedUrl };
}

const searchProspectsSchema = z.object({
  query: z.string().trim().max(120),
});

export type ProspectSearchHit = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
};

function escapeIlike(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
}

export async function searchProspects(
  input: z.infer<typeof searchProspectsSchema>,
): Promise<{ results: ProspectSearchHit[] }> {
  const { query } = searchProspectsSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  let q = supabase
    .from("prospects")
    .select("id, name, city, address")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (query.length > 0) {
    const term = `%${escapeIlike(query)}%`;
    q = q.or(`name.ilike.${term},city.ilike.${term},address.ilike.${term}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { results: (data ?? []) as ProspectSearchHit[] };
}

const deleteSchema = z.object({
  documentId: z.string().uuid(),
});

export async function deleteDocument(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!["admin", "owner", "super_admin"].includes(profile.role)) {
    throw new Error("Only admins can delete documents");
  }

  const { data: doc, error: getErr } = await supabase
    .from("documents")
    .select("id, prospect_id, storage_path, signed_storage_path, signature_url")
    .eq("id", parsed.documentId)
    .single();
  if (getErr || !doc) throw new Error("Document not found");

  const paths = [doc.storage_path, doc.signed_storage_path].filter(
    Boolean,
  ) as string[];
  if (paths.length > 0) {
    await supabase.storage.from("documents").remove(paths);
  }
  if (doc.signature_url) {
    await supabase.storage.from("signatures").remove([doc.signature_url]);
  }

  // Soft-delete the row by marking it failed and stripping paths. The
  // audit row is preserved (file gone, metadata stays).
  await supabase
    .from("documents")
    .update({
      status: "failed",
      storage_path: null,
      signed_storage_path: null,
      signature_url: null,
    })
    .eq("id", parsed.documentId);

  revalidatePath("/documents");
  if (doc.prospect_id) {
    revalidatePath(`/prospects/${doc.prospect_id}`);
  }
}

// ---------------------------------------------------------------------------
// signDocument — Stage 6: hand the signature PNG to the embed-signature
// Edge Function and (best-effort) email the signed PDF to the homeowner.
// ---------------------------------------------------------------------------
const signSchema = z.object({
  documentId: z.string().uuid(),
  signaturePngBase64: z.string().min(100),
  signerName: z.string().trim().min(1).max(120),
});

export async function signDocument(input: z.infer<typeof signSchema>) {
  const parsed = signSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();
  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to sign documents");
  }
  const h = await headers();

  const { data, error } = await supabase.functions.invoke("embed-signature", {
    body: {
      document_id: parsed.documentId,
      signature_png_base64: parsed.signaturePngBase64,
      signer_name: parsed.signerName,
      device_metadata: {
        user_agent: h.get("user-agent") ?? undefined,
        device_type: "web",
      },
    },
  });

  if (error) {
    throw new Error(error.message || "Signing failed");
  }
  const signed = (data as { signed_document?: { id: string } } | null)
    ?.signed_document;
  if (!signed?.id) throw new Error("embed-signature returned no document");

  // Best-effort email.
  try {
    await emailSignedDocument(signed.id);
  } catch {
    // non-fatal — UI shows a "Resend" affordance.
  }

  revalidatePath(`/documents/${parsed.documentId}`);
  revalidatePath("/documents");

  return { signedDocumentId: signed.id };
}

// ---------------------------------------------------------------------------
// uploadDocument — accepts a FormData payload (file + prospectId + displayName)
// so it can be called from a client form.
// ---------------------------------------------------------------------------
export async function uploadDocument(formData: FormData) {
  const prospectId = String(formData.get("prospectId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const file = formData.get("file");

  if (!prospectId) throw new Error("prospectId required");
  if (!(file instanceof File)) throw new Error("file required");
  if (file.size === 0) throw new Error("file is empty");
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Files must be under 25 MB");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Only PDF files are accepted");
  }

  const { supabase, profile } = await requireUserWithProfile();
  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to upload documents");
  }

  // Magic-bytes sniff: a real PDF starts with %PDF.
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const magic = String.fromCharCode(...head);
  if (magic !== "%PDF") {
    throw new Error("File does not look like a PDF");
  }

  // Pre-create the row to get an id for the storage path.
  const { data: doc, error: insErr } = await supabase
    .from("documents")
    .insert({
      tenant_id: profile.tenant_id,
      prospect_id: prospectId,
      type: "upload",
      status: "uploaded",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (insErr || !doc) throw new Error(insErr?.message || "insert failed");

  const storagePath = `${profile.tenant_id}/documents/${prospectId}/${doc.id}-${
    displayName ? slugify(displayName) : "upload"
  }.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) {
    await supabase.from("documents").delete().eq("id", doc.id);
    throw new Error(upErr.message);
  }

  await supabase
    .from("documents")
    .update({ storage_path: storagePath })
    .eq("id", doc.id);

  revalidatePath("/documents");
  revalidatePath(`/prospects/${prospectId}`);

  return { id: doc.id };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// emailSignedDocument — server action for Stage 6 + a "Resend" trigger
// from the doc detail. Best-effort: succeeds if the prospect has an email,
// otherwise returns a structured "no_email" result.
// ---------------------------------------------------------------------------
// Implemented as a no-op send for M5 if no SendGrid wrapper is wired.
// The signed PDF is already downloadable via the signed URL; emailing
// is a nice-to-have that lands once SENDGRID_API_KEY is in vault.
export async function emailSignedDocument(signedDocId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const { supabase } = await requireUserWithProfile();

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, signed_storage_path, prospect:prospects!prospect_id(email, name), tenant:tenants!tenant_id(name)",
    )
    .eq("id", signedDocId)
    .single();
  if (!doc) return { ok: false, reason: "not_found" };

  type ProspectLite = { email: string | null; name: string | null };
  type TenantLite = { name: string | null };
  const prospect = doc.prospect as unknown as ProspectLite | null;
  const tenant = doc.tenant as unknown as TenantLite | null;

  if (!prospect?.email) return { ok: false, reason: "no_email" };

  // Defer the actual SendGrid call until the M4 email wrapper exists.
  // Stamp the row so the Documents UI can show "Emailed at …" once we wire it.
  await (
    supabase.from as unknown as (
      t: string,
    ) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )("documents")
    .update({ email_status: "queued", email_sent_at: new Date().toISOString() })
    .eq("id", signedDocId);

  return { ok: true };
}
