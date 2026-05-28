"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canEditProspect } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPrivilege, requirePrivilege } from "@/lib/auth/privileges";
import type { UserRole } from "@/lib/types/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { substituteTokens } from "@/lib/templates/blocks";
import {
  normalizeTemplateDoc,
  type Section,
  type TemplateDoc,
} from "@/lib/templates/sections";
import { getDefaultDoc } from "@/lib/templates/defaults";
import type { Json } from "@/lib/supabase/database.types";
import { diffSections, diffFields } from "@/lib/templates/diff";
import { TEMPLATE_KINDS as SHARED_KINDS, type TemplateKind as SharedTemplateKind } from "@/lib/templates/template-kinds";

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

const TEMPLATE_KINDS = SHARED_KINDS;
export type TemplateKind = SharedTemplateKind;

// Permissive — the canonical shape lives in lib/templates/sections.ts.
// Validating in detail here would couple this server action to every
// schema bump; we trust the editor to produce well-formed data.
const templateDocSchema = z
  .object({
    sections: z.array(z.any()).optional(),
    blocks: z.array(z.any()).optional(),
  })
  .passthrough();

const createSchema = z.object({
  prospectId: z.string().uuid(),
  templateKind: z.enum(TEMPLATE_KINDS),
  fields: z.record(z.string(), z.unknown()).optional(),
  // Telefonista edit payload (all optional — when missing we run the
  // legacy path and the Edge Function decides whether a custom template
  // applies).
  templateVersionId: z.string().uuid().optional(),
  finalContent: templateDocSchema.optional(),
  baselineContent: templateDocSchema.optional(),
  fieldOverrides: z.record(z.string(), z.string()).optional(),
  fieldBaseline: z.record(z.string(), z.string()).optional(),
  /** When false, skip the auto-company-sign step even if the tenant
   *  has a saved signature. Defaults true. */
  autoCompanySign: z.boolean().optional(),
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
      final_content: parsed.finalContent,
      field_overrides: parsed.fieldOverrides,
      template_version_id: parsed.templateVersionId,
    },
  });
  if (error) {
    throw new Error(error.message || "generate-pdf failed");
  }
  const document = (data as {
    document?: { id: string; template_version_id?: string | null };
  } | null)?.document;
  if (!document?.id) {
    throw new Error("generate-pdf returned no document");
  }

  // Record telefonista edits — never mutates the template. Both diffs
  // can be empty (e.g. telefonista did not touch anything); we still
  // persist the row so the audit log shows what version (or defaults)
  // the document was generated against.
  if (parsed.finalContent) {
    const fieldChanges = diffFields(
      parsed.fieldBaseline ?? {},
      parsed.fieldOverrides ?? {},
    );
    const sectionChanges = parsed.baselineContent
      ? diffSections(
          normalizeTemplateDoc(parsed.baselineContent),
          normalizeTemplateDoc(parsed.finalContent),
        )
      : [];

    await supabase.from("document_edits").insert({
      tenant_id: profile.tenant_id,
      document_id: document.id,
      template_version_id: parsed.templateVersionId ?? null,
      field_changes: fieldChanges as unknown as Json,
      body_changes: sectionChanges as unknown as Json,
      final_content: parsed.finalContent as unknown as Json,
      edited_by: profile.id,
    });
  }

  // Auto-company-sign: if the tenant has a saved company signature
  // AND the caller didn't opt out, immediately apply it to the rep
  // line. The doc moves to 'awaiting_homeowner_signature' (NOT
  // 'signed' — rufero stays unblocked).
  if (parsed.autoCompanySign !== false) {
    await maybeAutoCompanySign(supabase, profile.tenant_id, document.id);
  }

  revalidatePath(`/prospects/${parsed.prospectId}`);
  revalidatePath("/documents");

  return { id: document.id };
}

async function maybeAutoCompanySign(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  documentId: string,
) {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("company_signature_path, company_signature_signer")
    .eq("id", tenantId)
    .single();
  if (!tenant?.company_signature_path || !tenant.company_signature_signer) {
    return; // No stored sig — nothing to do.
  }

  // The signatures bucket RLS is configured for SELECT scoped by
  // JWT tenant_id. Telefonista can have a different / missing claim,
  // so use the service role to fetch — tenant scoping is preserved
  // by the path the owner stamped onto the tenants row.
  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage
    .from("signatures")
    .download(tenant.company_signature_path);
  if (dlErr || !blob) return; // Best-effort — don't fail the whole doc.

  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Tiny base64 encoder — no Buffer in some runtimes.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const pngBase64 = btoa(bin);

  await supabase.functions.invoke("embed-signature", {
    body: {
      document_id: documentId,
      signature_png_base64: pngBase64,
      signer_name: tenant.company_signature_signer,
      signer_role: "company",
      device_metadata: { device_type: "web" },
    },
  });
}

// ---------------------------------------------------------------------------
// loadTemplateForPreview — used by NewDocumentDialog's preview-edit step.
// Returns the substituted markdown (used as a textarea baseline) AND the
// full block doc + resolved values so we can diff later.
// ---------------------------------------------------------------------------
const previewSchema = z.object({
  prospectId: z.string().uuid(),
  templateKind: z.enum(TEMPLATE_KINDS),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export type TemplatePreview = {
  /** Null when no custom version is published — defaults are in use. */
  templateVersionId: string | null;
  baselineContent: TemplateDoc;
  resolvedValues: Record<string, string>;
  /** Whether the tenant has a saved company signature ready for
   *  auto-apply. Drives the "Apply company signature" checkbox in
   *  the New Document dialog. */
  hasCompanySignature: boolean;
};

export async function loadTemplateForPreview(
  input: z.infer<typeof previewSchema>,
): Promise<TemplatePreview> {
  const parsed = previewSchema.parse(input);
  const { supabase, profile } = await requireUserWithProfile();

  if (!canEditProspect(profile.role as UserRole)) {
    throw new Error("You don't have permission to generate documents");
  }

  const { data: tpl } = await supabase
    .from("document_templates")
    .select("id, active_version_id")
    .eq("tenant_id", profile.tenant_id)
    .eq("kind", parsed.templateKind)
    .maybeSingle();

  // Resolve source content: published custom version if available,
  // otherwise the built-in defaults. The dialog ALWAYS shows the
  // section list now (so the telefonista can edit per-prospect).
  let sourceContent: TemplateDoc = getDefaultDoc(parsed.templateKind);
  let templateVersionId: string | null = null;
  if (tpl?.active_version_id) {
    const { data: ver } = await supabase
      .from("document_template_versions")
      .select("id, content")
      .eq("id", tpl.active_version_id)
      .single();
    if (ver?.content) {
      sourceContent = normalizeTemplateDoc(ver.content as unknown);
      templateVersionId = ver.id;
    }
  }

  const [{ data: prospect }, { data: tenantRow }] = await Promise.all([
    supabase
      .from("prospects")
      .select("name, address, city, state, zip")
      .eq("id", parsed.prospectId)
      .single(),
    supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .single(),
  ]);

  // contractor_name is the company name captured at signup (tenants.name).
  // Renames here propagate to every newly-generated preview / PDF.
  // Uppercased to match the convention used in the rendered PDF.
  const tenantName = (tenantRow?.name?.trim() ?? "").toUpperCase();

  const fields = (parsed.fields ?? {}) as Record<string, unknown>;
  const insurance = (fields.insurance_company as string | undefined) ?? "";
  const deductibleNum = fields.deductible as number | undefined;
  const deductible =
    typeof deductibleNum === "number" ? `$${deductibleNum.toFixed(2)}` : "";
  const totalJobCostNum = fields.total_job_cost as number | undefined;
  const totalJobCost =
    typeof totalJobCostNum === "number" ? `$${totalJobCostNum.toFixed(2)}` : "";
  const scope = (fields.scope_of_work as string | undefined) ?? "";

  const resolvedValues: Record<string, string> = {
    homeowner_name: prospect?.name ?? "",
    property_address: [
      prospect?.address,
      prospect?.city,
      prospect?.state,
      prospect?.zip,
    ]
      .filter(Boolean)
      .join(", "),
    contractor_name: tenantName,
    // Intentionally blank — filled by mobile / handwritten on the
    // printed copy (matches the generate-pdf token map).
    today: "",
    claim_number: "",
    loss_date: "",
    insurance_company: insurance,
    deductible,
    total_job_cost: totalJobCost,
    scope_of_work: scope,
  };

  const content = sourceContent;

  // Substitute tokens in each section's content + title.
  const substitutedSections: Section[] = content.sections.map((sec) => ({
    ...sec,
    title: sec.title.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) =>
      resolvedValues[k] != null && resolvedValues[k] !== "" ? resolvedValues[k] : `[${k}]`,
    ),
    content: substituteTokens({ blocks: sec.content }, resolvedValues).blocks,
  }));
  const substituted: TemplateDoc = { sections: substitutedSections };

  // Refresh signed URLs on image blocks inside section content.
  for (const sec of substituted.sections) {
    for (const b of sec.content) {
      if (b.type === "image" && b.storagePath) {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(b.storagePath, 60 * 60 * 6);
        if (data?.signedUrl) b.src = data.signedUrl;
      }
    }
  }

  // Check whether a tenant-level company signature is saved, so the
  // dialog can offer the "Apply company signature" checkbox.
  const { data: tenantSig } = await supabase
    .from("tenants")
    .select("company_signature_path")
    .eq("id", profile.tenant_id)
    .single();
  const hasCompanySignature = !!tenantSig?.company_signature_path;

  return {
    templateVersionId,
    baselineContent: substituted,
    resolvedValues,
    hasCompanySignature,
  };
}

// Used by the document detail page to surface the audit row for owners.
export async function listDocumentEdits(documentId: string) {
  const { supabase } = await requireUserWithProfile();
  const { data, error } = await supabase
    .from("document_edits")
    .select(
      "id, created_at, template_version_id, field_changes, body_changes, editor:users!edited_by(first_name, last_name, email), version:document_template_versions!template_version_id(version_no)",
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
  const { supabase } = await requireUserWithProfile();

  const currentUser = await getCurrentUser();
  if (!hasPrivilege(currentUser, "delete_documents")) {
    throw new Error("You don't have permission to delete documents");
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
  /**
   * Web sign is always the company representative. Homeowner signs
   * from the mobile app once status is 'awaiting_homeowner_signature'.
   * Accepted as a literal here for clarity at the call site.
   */
  signerRole: z.literal("company").optional(),
});

export async function signDocument(input: z.infer<typeof signSchema>) {
  const parsed = signSchema.parse(input);
  const { supabase } = await requireUserWithProfile();

  // Web signing is restricted to the company representative path —
  // requires the sign_documents_as_company privilege.
  const currentUser = await getCurrentUser();
  requirePrivilege(currentUser, "sign_documents_as_company");
  const h = await headers();

  const { data, error } = await supabase.functions.invoke("embed-signature", {
    body: {
      document_id: parsed.documentId,
      signature_png_base64: parsed.signaturePngBase64,
      signer_name: parsed.signerName,
      signer_role: "company",
      device_metadata: {
        user_agent: h.get("user-agent") ?? undefined,
        device_type: "web",
      },
    },
  });

  if (error) {
    throw new Error(error.message || "Signing failed");
  }
  const signed = (data as {
    signed_document?: { id: string; status?: string };
  } | null)?.signed_document;
  if (!signed?.id) throw new Error("embed-signature returned no document");

  // The web only does the company sign (status moves to
  // 'awaiting_homeowner_signature'). The homeowner signs from the
  // mobile app — that flow handles the final-state email itself.

  revalidatePath(`/documents/${parsed.documentId}`);
  revalidatePath("/documents");

  return { signedDocumentId: signed.id, status: signed.status };
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
