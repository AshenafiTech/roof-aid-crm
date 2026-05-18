"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/auth";
import { TEMPLATE_KINDS, type TemplateKind } from "@/lib/templates/template-kinds";
import { normalizeMammothMarkdown } from "@/lib/templates/blocks";
import {
  normalizeTemplateDoc,
  type TemplateDoc,
} from "@/lib/templates/sections";
import { getDefaultDoc } from "@/lib/templates/defaults";
import type { Json } from "@/lib/supabase/database.types";

// Loose schema for the persisted template JSON. The canonical shape is
// { sections: [...] } (apps/web/lib/templates/sections.ts); we also
// accept the legacy { blocks: [...] } payload and let `normalizeTemplateDoc`
// migrate it.
const templateContentSchema = z
  .object({
    sections: z.array(z.any()).optional(),
    blocks: z.array(z.any()).optional(),
  })
  .passthrough();

const OWNER_ROLES: UserRole[] = ["owner", "admin", "super_admin"];

async function requireOwner() {
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
  if (!OWNER_ROLES.includes(profile.role as UserRole)) {
    throw new Error("Only owners or admins can manage document templates");
  }
  return { supabase, profile };
}

// ---------------------------------------------------------------------------
// Resolve (or create) the document_templates row for (tenant, kind).
// ---------------------------------------------------------------------------
async function getOrCreateTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  kind: TemplateKind,
) {
  const existing = await supabase
    .from("document_templates")
    .select("id, kind, active_version_id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .maybeSingle();
  if (existing.data) return existing.data;

  const inserted = await supabase
    .from("document_templates")
    .insert({ tenant_id: tenantId, kind })
    .select("id, kind, active_version_id")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message || "Failed to create template");
  }
  return inserted.data;
}

// ---------------------------------------------------------------------------
// saveDraft — create a new draft version with the editor content.
// ---------------------------------------------------------------------------
const saveDraftSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  // The section-based document JSON produced by the section editor.
  content: templateContentSchema,
  changeSummary: z.string().max(280).optional(),
});

export async function saveTemplateDraft(input: z.infer<typeof saveDraftSchema>) {
  const parsed = saveDraftSchema.parse(input);
  const { supabase, profile } = await requireOwner();

  const tpl = await getOrCreateTemplate(supabase, profile.tenant_id, parsed.kind);
  const doc: TemplateDoc = normalizeTemplateDoc(parsed.content);

  const { data, error } = await supabase
    .from("document_template_versions")
    .insert({
      template_id: tpl.id,
      tenant_id: profile.tenant_id,
      content: doc as unknown as Json,
      source: "editor",
      created_by: profile.id,
      change_summary: parsed.changeSummary ?? null,
    })
    .select("id, version_no")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to save draft");
  }

  revalidatePath(`/admin/settings/document-templates/${parsed.kind}`);
  revalidatePath(`/admin/settings/document-templates/${parsed.kind}/history`);
  return { versionId: data.id as string, versionNo: data.version_no as number };
}

// ---------------------------------------------------------------------------
// publishVersion — set active_version_id on the template and stamp the
// version's published_at.
// ---------------------------------------------------------------------------
const publishSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  versionId: z.string().uuid(),
});

export async function publishTemplateVersion(input: z.infer<typeof publishSchema>) {
  const parsed = publishSchema.parse(input);
  const { supabase, profile } = await requireOwner();

  // Verify the version belongs to this tenant + kind.
  const { data: version, error: vErr } = await supabase
    .from("document_template_versions")
    .select("id, template_id, tenant_id")
    .eq("id", parsed.versionId)
    .single();
  if (vErr || !version) throw new Error("Version not found");
  if (version.tenant_id !== profile.tenant_id) {
    throw new Error("Cross-tenant access denied");
  }

  await supabase
    .from("document_template_versions")
    .update({ published_at: new Date().toISOString() })
    .eq("id", parsed.versionId);

  await supabase
    .from("document_templates")
    .update({ active_version_id: parsed.versionId })
    .eq("id", version.template_id);

  revalidatePath(`/admin/settings/document-templates`);
  revalidatePath(`/admin/settings/document-templates/${parsed.kind}`);
  revalidatePath(`/admin/settings/document-templates/${parsed.kind}/history`);
}

// ---------------------------------------------------------------------------
// revertToDefault — clear active_version_id so the Edge Function falls
// back to the hardcoded legal copy.
// ---------------------------------------------------------------------------
const revertSchema = z.object({ kind: z.enum(TEMPLATE_KINDS) });

export async function revertTemplateToDefault(input: z.infer<typeof revertSchema>) {
  const parsed = revertSchema.parse(input);
  const { supabase, profile } = await requireOwner();

  await supabase
    .from("document_templates")
    .update({ active_version_id: null })
    .eq("tenant_id", profile.tenant_id)
    .eq("kind", parsed.kind);

  revalidatePath(`/admin/settings/document-templates`);
  revalidatePath(`/admin/settings/document-templates/${parsed.kind}`);
}

// ---------------------------------------------------------------------------
// importDocxTemplate — accept a .docx, parse to markdown via mammoth,
// return it to the client for confirmation before save.
// ---------------------------------------------------------------------------
export async function importDocxTemplate(
  formData: FormData,
): Promise<{ markdown: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("file required");
  if (file.size === 0) throw new Error("file is empty");
  if (file.size > 5 * 1024 * 1024) throw new Error("DOCX must be under 5 MB");

  await requireOwner();

  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await file.arrayBuffer());
  const { value: raw } = await mammoth.convertToMarkdown({ buffer });
  return { markdown: normalizeMammothMarkdown(raw) };
}

// ---------------------------------------------------------------------------
// importDocxHtml — used by the TipTap editor. Returns the DOCX as HTML
// (with embedded images as data URIs by default) so TipTap can hydrate
// formatting + images. Caller is expected to subsequently upload any
// data-URI images via uploadTemplateImage to convert them to durable
// storage URLs.
// ---------------------------------------------------------------------------
export async function importDocxHtml(
  formData: FormData,
): Promise<{ html: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("file required");
  if (file.size === 0) throw new Error("file is empty");
  if (file.size > 10 * 1024 * 1024) throw new Error("DOCX must be under 10 MB");

  await requireOwner();

  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await file.arrayBuffer());
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return { html };
}

// ---------------------------------------------------------------------------
// uploadTemplateImage — store a PNG/JPG in the documents bucket under
// {tenant_id}/template-images/... and return a signed URL the editor
// can use as the <img src>. Path is tenant-isolated so existing RLS
// applies.
// ---------------------------------------------------------------------------
export async function uploadTemplateImage(
  formData: FormData,
): Promise<{ url: string; storagePath: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("file required");
  if (file.size === 0) throw new Error("file is empty");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
  const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Only PNG, JPEG, GIF, or WEBP images are allowed");
  }

  const { supabase, profile } = await requireOwner();

  const ext = file.type === "image/png" ? "png"
    : file.type === "image/jpeg" ? "jpg"
    : file.type === "image/gif" ? "gif"
    : "webp";
  const rand = crypto.randomUUID();
  const storagePath = `${profile.tenant_id}/template-images/${rand}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  // Signed URL valid for 7 days — the editor will refresh it on every
  // load via loadTemplateForEdit which re-signs.
  const { data: signed, error: sErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (sErr || !signed?.signedUrl) {
    throw new Error(sErr?.message || "Failed to sign upload URL");
  }
  return { url: signed.signedUrl, storagePath };
}

// ---------------------------------------------------------------------------
// Read-side helpers used by the settings pages.
// ---------------------------------------------------------------------------
export type TemplateSummary = {
  kind: TemplateKind;
  templateId: string | null;
  activeVersionNo: number | null;
  lastUpdatedAt: string | null;
};

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { supabase, profile } = await requireOwner();

  const { data: rows, error } = await supabase
    .from("document_templates")
    .select(
      "id, kind, active_version_id, updated_at, active_version:document_template_versions!document_templates_active_version_fk(version_no)",
    )
    .eq("tenant_id", profile.tenant_id);
  if (error) throw new Error(error.message);

  const byKind = new Map<TemplateKind, TemplateSummary>();
  for (const k of TEMPLATE_KINDS) {
    byKind.set(k, {
      kind: k,
      templateId: null,
      activeVersionNo: null,
      lastUpdatedAt: null,
    });
  }
  for (const r of rows ?? []) {
    type Joined = { version_no: number } | { version_no: number }[] | null;
    const av = r.active_version as Joined;
    const verNo = Array.isArray(av) ? av[0]?.version_no ?? null : av?.version_no ?? null;
    byKind.set(r.kind as TemplateKind, {
      kind: r.kind as TemplateKind,
      templateId: r.id,
      activeVersionNo: r.active_version_id ? verNo : null,
      lastUpdatedAt: r.updated_at,
    });
  }
  return Array.from(byKind.values());
}

export async function loadTemplateForEdit(kind: TemplateKind): Promise<{
  templateId: string;
  activeVersionId: string | null;
  activeVersionNo: number | null;
  content: TemplateDoc;
}> {
  const { supabase, profile } = await requireOwner();
  const tpl = await getOrCreateTemplate(supabase, profile.tenant_id, kind);

  let content: TemplateDoc = getDefaultDoc(kind);
  let activeVersionNo: number | null = null;
  if (tpl.active_version_id) {
    const { data: ver } = await supabase
      .from("document_template_versions")
      .select("content, version_no")
      .eq("id", tpl.active_version_id)
      .single();
    if (ver) {
      activeVersionNo = ver.version_no;
      content = normalizeTemplateDoc(ver.content as unknown);
    }
  }

  // Refresh signed URLs on image blocks (used inside section content)
  // so the editor can render them. Done in-place; image blocks travel
  // inside section.content arrays.
  for (const sec of content.sections) {
    for (const b of sec.content) {
      if (b.type === "image" && b.storagePath) {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(b.storagePath, 60 * 60 * 24 * 7);
        if (data?.signedUrl) b.src = data.signedUrl;
      }
    }
  }

  return {
    templateId: tpl.id,
    activeVersionId: tpl.active_version_id,
    activeVersionNo,
    content,
  };
}

export type VersionRow = {
  id: string;
  versionNo: number;
  createdAt: string;
  publishedAt: string | null;
  isActive: boolean;
  source: string;
  changeSummary: string | null;
  createdByName: string | null;
};

export async function listVersions(kind: TemplateKind): Promise<VersionRow[]> {
  const { supabase, profile } = await requireOwner();

  const { data: tpl } = await supabase
    .from("document_templates")
    .select("id, active_version_id")
    .eq("tenant_id", profile.tenant_id)
    .eq("kind", kind)
    .maybeSingle();
  if (!tpl) return [];

  const { data: rows, error } = await supabase
    .from("document_template_versions")
    .select(
      "id, version_no, created_at, published_at, source, change_summary, created_by, creator:users!created_by(first_name, last_name, email)",
    )
    .eq("template_id", tpl.id)
    .order("version_no", { ascending: false });
  if (error) throw new Error(error.message);

  type CreatorRow = { first_name: string | null; last_name: string | null; email: string | null };
  type Creator = CreatorRow | CreatorRow[] | null;

  return (rows ?? []).map((r) => {
    const c = r.creator as Creator;
    const creator = Array.isArray(c) ? c[0] : c;
    const display = creator
      ? [creator.first_name, creator.last_name].filter(Boolean).join(" ").trim() ||
        creator.email
      : null;
    return {
      id: r.id,
      versionNo: r.version_no,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      isActive: r.id === tpl.active_version_id,
      source: r.source,
      changeSummary: r.change_summary,
      createdByName: display,
    };
  });
}
