// Edge Function — generate-pdf
//
// Contract:
//   POST {
//     prospect_id,
//     template_kind,
//     fields?,
//     final_content?,          // TemplateDoc (section-based) — telefonista's edited copy
//     field_overrides?,
//     template_version_id?     // active version the telefonista saw (null when defaults)
//   }
//   -> { document: { id, storage_path, sha256, page_count, status, template_version_id? } }
//
// Layout: every generated PDF has three regions
//   1. Fixed header — title + metadata (claim #, date of loss, date,
//      homeowner, property address, contractor).
//   2. Sections — auto-numbered, owner-editable.
//   3. Fixed footer — signature block at the bottom of the LAST page.
//
// Storage path: documents/{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

import {
  corsHeaders,
  getAuthedUser,
  jsonError,
  jsonOk,
  preflight,
} from '../_shared/auth.ts'
import {
  createStandardContext,
  drawFooters,
  normalizeTemplateDoc,
  renderSections,
  renderSignatureBlock,
  renderTemplateHeader,
  substituteTokens,
  type Block,
  type ImageFetcher,
  type TemplateDoc,
} from '../_shared/template-pdf.ts'
import { getDefaultDoc, type TemplateKind } from '../_shared/template-defaults.ts'

const ALLOWED_KINDS: TemplateKind[] = [
  '3rd_party_auth',
  'acv_contract',
  'rcv_contract',
  'supplement',
]

const ALLOWED_ROLES = ['telefonista', 'admin', 'owner', 'super_admin']

const TEMPLATE_TITLES: Record<TemplateKind, string> = {
  '3rd_party_auth': 'Third-Party Authorization & Contractor Communication Agreement',
  acv_contract: 'ACV Contract',
  rcv_contract: 'RCV Contract',
  supplement: 'Supplement Document',
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed')

  const authed = await getAuthedUser(req)
  if ('error' in authed) return authed.error
  const { user, supabase } = authed

  if (!ALLOWED_ROLES.includes(user.role)) {
    return jsonError(403, 'forbidden', `Role ${user.role} cannot generate documents`)
  }

  let input: {
    prospect_id?: string
    template_kind?: TemplateKind
    fields?: Record<string, unknown>
    final_content?: TemplateDoc | { blocks: unknown[] }
    field_overrides?: Record<string, string>
    template_version_id?: string
  }
  try {
    input = await req.json()
  } catch {
    return jsonError(400, 'invalid_json')
  }

  if (!input.prospect_id) return jsonError(400, 'missing_prospect_id')
  if (!input.template_kind || !ALLOWED_KINDS.includes(input.template_kind)) {
    return jsonError(400, 'invalid_template_kind')
  }

  // 1. Load prospect; verify tenant.
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, tenant_id, name, address, city, state, zip, phones, email')
    .eq('id', input.prospect_id)
    .single()
  if (pErr || !prospect) return jsonError(404, 'prospect_not_found')
  if (prospect.tenant_id !== user.tenant_id && user.role !== 'super_admin') {
    return jsonError(403, 'forbidden', 'Cross-tenant access denied')
  }

  // 1b. Resolve tenant name for the signature label + token substitution.
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', prospect.tenant_id)
    .single()
  const tenantName = tenantRow?.name?.trim() || 'Roof AID'

  // 2. Resolve template:
  //    - Telefonista-edited (final_content) → use exactly.
  //    - Else published custom version → use it.
  //    - Else built-in defaults.
  let templateDoc: TemplateDoc
  let templateVersionId: string | null = null
  if (input.final_content) {
    templateDoc = normalizeTemplateDoc(input.final_content)
    templateVersionId = input.template_version_id ?? null
  } else {
    const { data: tpl } = await supabase
      .from('document_templates')
      .select('id, active_version_id')
      .eq('tenant_id', prospect.tenant_id)
      .eq('kind', input.template_kind)
      .maybeSingle()
    if (tpl?.active_version_id) {
      const { data: ver } = await supabase
        .from('document_template_versions')
        .select('id, content')
        .eq('id', tpl.active_version_id)
        .single()
      if (ver?.content) {
        templateDoc = normalizeTemplateDoc(ver.content)
        templateVersionId = ver.id
      } else {
        templateDoc = getDefaultDoc(input.template_kind)
      }
    } else {
      templateDoc = getDefaultDoc(input.template_kind)
    }
  }

  // 3. Resolve token values (header fields + content variables).
  //
  // Header fields are split into three sources:
  //   - From the prospect record: homeowner_name, property_address.
  //   - From the tenant record: contractor_name (= tenants.name, which is
  //     the company name captured at signup; renames propagate to every
  //     newly generated document since we re-read it each call).
  //   - Intentionally blank: claim_number, today (the "Date" field), and
  //     loss_date. These are filled by mobile/inspection after the doc is
  //     generated, or are handwritten on the printed copy. Even if a
  //     telefonista typed values in NewDocumentDialog they're ignored so
  //     the PDF shows fillable dashed lines.
  const homeowner = prospect.name ?? ''
  const address = [prospect.address, prospect.city, prospect.state, prospect.zip]
    .filter(Boolean)
    .join(', ')
  const fields = (input.fields ?? {}) as Record<string, unknown>
  const insurance = (fields.insurance_company as string | undefined) ?? ''
  const deductibleNum = fields.deductible as number | undefined
  const deductible = typeof deductibleNum === 'number' ? `$${deductibleNum.toFixed(2)}` : ''
  const totalJobCostNum = fields.total_job_cost as number | undefined
  const totalJobCost =
    typeof totalJobCostNum === 'number' ? `$${totalJobCostNum.toFixed(2)}` : ''
  const scope = (fields.scope_of_work as string | undefined) ?? ''

  const tokenValues: Record<string, string> = {
    homeowner_name: homeowner,
    property_address: address,
    contractor_name: tenantName,
    // Intentionally blank — filled by mobile / handwritten:
    today: '',
    claim_number: '',
    loss_date: '',
    // Optional per-template body fields:
    insurance_company: insurance,
    deductible,
    total_job_cost: totalJobCost,
    scope_of_work: scope,
    ...(input.field_overrides ?? {}),
  }
  const substituted = substituteTokens(templateDoc, tokenValues)

  // 4. Pre-create the documents row so we have an id for the storage path.
  const templateData: Record<string, unknown> = { ...(input.fields ?? {}) }
  if (templateVersionId) templateData.template_version_id = templateVersionId
  if (input.field_overrides) templateData.field_overrides = input.field_overrides

  const { data: doc, error: dErr } = await supabase
    .from('documents')
    .insert({
      tenant_id: prospect.tenant_id,
      prospect_id: prospect.id,
      type: input.template_kind,
      status: 'generated',
      created_by: user.id,
      template_data: templateData,
    })
    .select('id')
    .single()
  if (dErr || !doc) return jsonError(500, 'db_insert_failed', dErr?.message)

  // 5. Render the PDF.
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const ctx = createStandardContext({
    pdf,
    helv,
    helvBold,
    helvItalic,
    title: TEMPLATE_TITLES[input.template_kind],
  })

  // Image fetcher — resolves storage paths via the authenticated client.
  const fetchImage: ImageFetcher = async (block: Extract<Block, { type: 'image' }>) => {
    try {
      if (block.storagePath) {
        const { data, error } = await supabase.storage
          .from('documents')
          .download(block.storagePath)
        if (error || !data) return null
        const bytes = new Uint8Array(await data.arrayBuffer())
        const mime = block.storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
        return { bytes, mime }
      }
      if (block.src && /^https?:\/\//.test(block.src)) {
        const resp = await fetch(block.src)
        if (!resp.ok) return null
        const buf = new Uint8Array(await resp.arrayBuffer())
        const ct = resp.headers.get('content-type') ?? ''
        const mime = ct.includes('png') ? 'image/png' : 'image/jpeg'
        return { bytes: buf, mime }
      }
      return null
    } catch {
      return null
    }
  }

  // Fixed top metadata block. claim_number, loss_date, and the "Date"
  // (today) field are intentionally blank — see the tokenValues comment
  // above. Renderer draws a fillable dashed line when value is empty.
  renderTemplateHeader(ctx, {
    claim_number: '',
    loss_date: '',
    today: '',
    homeowner_name: homeowner,
    property_address: address,
    contractor_name: tenantName,
  })

  // Owner-editable sections (auto-numbered).
  await renderSections(ctx, substituted.sections, fetchImage)

  // Fixed bottom signature block. Returns BOTH the homeowner and
  // representative signature anchors so embed-signature can drop the
  // PNG on whichever line matches the signer's role.
  const sigAnchors = renderSignatureBlock(ctx, tenantName)

  drawFooters(ctx)

  const bytes = await pdf.save()
  const sha256 = await sha256Hex(bytes)
  const storagePath = `${prospect.tenant_id}/documents/${prospect.id}/${doc.id}-unsigned.pdf`

  const { error: uErr } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (uErr) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return jsonError(500, 'storage_upload_failed', uErr.message)
  }

  // Stash signature anchors on the document row so embed-signature
  // can place the PNG on the right line per signer role, even if the
  // visual layout moves in the future.
  const updatedTemplateData = {
    ...templateData,
    homeowner_sig_anchor: sigAnchors.homeowner,
    rep_sig_anchor: sigAnchors.rep,
    tenant_name: tenantName,
  }
  await supabase
    .from('documents')
    .update({
      storage_path: storagePath,
      sha256,
      page_count: pdf.getPageCount(),
      template_data: updatedTemplateData,
    })
    .eq('id', doc.id)

  return jsonOk({
    document: {
      id: doc.id,
      storage_path: storagePath,
      sha256,
      page_count: pdf.getPageCount(),
      status: 'generated',
      template_version_id: templateVersionId,
    },
  })
})

// Re-export to silence "unused" warnings during linting.
export { corsHeaders }
