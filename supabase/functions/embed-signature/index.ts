// Edge Function — embed-signature
//
// Contract:
//   POST { document_id, signature_png_base64, signer_name, signer_role?, device_metadata? }
//   -> { signed_document: { id, storage_path, sha256, status, signer_role, signed_at } }
//
// Storage paths:
//   documents/{tenant_id}/documents/{prospect_id}/{doc_id}-signed.pdf
//   signatures/{tenant_id}/{document_id}.png            (homeowner / final sign)
//   signatures/{tenant_id}/{document_id}-company.png    (company sign)
//
// Two-party flow:
//   1st call: signer_role='company' → status='awaiting_homeowner_signature'
//             signature lands on the {Tenant} Representative line.
//   2nd call: signer_role='homeowner' (or omitted) → status='signed'
//             signature lands on the Homeowner line.
//
// Signature placement uses anchors written by generate-pdf into
// documents.template_data:
//   { homeowner_sig_anchor: { x, y, width }, rep_sig_anchor: { x, y, width } }
// Falls back to legacy hardcoded coords for documents generated
// before those anchors were persisted.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

import {
  corsHeaders,
  getAuthedUser,
  jsonError,
  jsonOk,
  preflight,
} from '../_shared/auth.ts'

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/png;base64,/, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

interface Anchor {
  x: number
  y: number
  width: number
}

function readAnchor(
  templateData: Record<string, unknown>,
  key: 'homeowner_sig_anchor' | 'rep_sig_anchor',
  fallback: Anchor,
): Anchor {
  const a = templateData[key] as { x?: number; y?: number; width?: number } | undefined
  return {
    x: typeof a?.x === 'number' ? a.x : fallback.x,
    y: typeof a?.y === 'number' ? a.y : fallback.y,
    width: typeof a?.width === 'number' ? a.width : fallback.width,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed')

  const authed = await getAuthedUser(req)
  if ('error' in authed) return authed.error
  const { user, supabase } = authed

  let input: {
    document_id?: string
    signature_png_base64?: string
    signer_name?: string
    /// 'company' = first sign of a two-party flow (web). Leaves the
    /// doc at status='awaiting_homeowner_signature' so mobile can
    /// stamp the homeowner sig later. Omit (or pass 'homeowner') for
    /// the second/final sign — current mobile behaviour.
    signer_role?: 'company' | 'homeowner'
    device_metadata?: {
      ip?: string
      user_agent?: string
      device_type?: 'web' | 'mobile_ios' | 'mobile_android'
    }
  }
  try {
    input = await req.json()
  } catch {
    return jsonError(400, 'invalid_json')
  }

  if (!input.document_id) return jsonError(400, 'missing_document_id')
  if (!input.signature_png_base64) return jsonError(400, 'missing_signature_png_base64')
  if (!input.signer_name?.trim()) return jsonError(400, 'missing_signer_name')

  const signerRole: 'company' | 'homeowner' =
    input.signer_role === 'company' ? 'company' : 'homeowner'
  const finalStatus =
    signerRole === 'company' ? 'awaiting_homeowner_signature' : 'signed'

  // 1. Load original document (incl. template_data so we can look up
  //    the signature anchor coords stamped by generate-pdf).
  const { data: original, error: oErr } = await supabase
    .from('documents')
    .select(
      'id, tenant_id, prospect_id, status, storage_path, signed_storage_path, template_data',
    )
    .eq('id', input.document_id)
    .single()
  if (oErr || !original) return jsonError(404, 'document_not_found')
  if (original.tenant_id !== user.tenant_id && user.role !== 'super_admin') {
    return jsonError(403, 'forbidden', 'Cross-tenant access denied')
  }
  if (original.status === 'signed') {
    return jsonError(400, 'already_signed')
  }
  if (!original.storage_path) {
    return jsonError(400, 'unsigned_pdf_missing')
  }

  // 2. Download the PDF we're stamping on top of.
  //
  // Two-party signing: if there's already a signed copy (company
  // signed earlier), start from THAT so the existing signature is
  // preserved and the new one stacks on top. For single-party docs,
  // or the first sign of a two-party doc, fall back to the unsigned
  // original.
  const sourcePath = original.signed_storage_path ?? original.storage_path
  const { data: blob, error: dlErr } = await supabase.storage
    .from('documents')
    .download(sourcePath)
  if (dlErr || !blob) return jsonError(500, 'pdf_download_failed', dlErr?.message)
  const pdfBytes = new Uint8Array(await blob.arrayBuffer())

  // 3. Decode signature PNG.
  let sigBytes: Uint8Array
  try {
    sigBytes = base64ToBytes(input.signature_png_base64)
  } catch (e) {
    return jsonError(400, 'invalid_signature_png', String(e))
  }

  // 4. Load PDF and embed signature at the right anchor for this role.
  let pdf
  try {
    pdf = await PDFDocument.load(pdfBytes)
  } catch (e) {
    return jsonError(500, 'pdf_parse_failed', String(e))
  }
  const sigImage = await pdf.embedPng(sigBytes)
  const lastPage = pdf.getPages()[pdf.getPageCount() - 1]
  const helv = await pdf.embedFont(StandardFonts.Helvetica)

  // Pick the anchor by role. generate-pdf stamps both anchors onto
  // documents.template_data; legacy docs fall back to the old
  // hardcoded coords so they still sign cleanly.
  const tplData = (original.template_data ?? {}) as Record<string, unknown>
  const HOME_FALLBACK: Anchor = { x: 175, y: 310, width: 220 }
  const REP_FALLBACK: Anchor = { x: 245, y: 130, width: 220 }
  const anchor =
    signerRole === 'company'
      ? readAnchor(tplData, 'rep_sig_anchor', REP_FALLBACK)
      : readAnchor(tplData, 'homeowner_sig_anchor', HOME_FALLBACK)

  const sigWidth = anchor.width
  const ratio = sigImage.width === 0 ? 1 : sigWidth / sigImage.width
  const sigHeight = Math.min(sigImage.height * ratio, 32)
  // Signature image sits on top of the underline.
  lastPage.drawImage(sigImage, {
    x: anchor.x,
    y: anchor.y + 2,
    width: sigWidth,
    height: sigHeight,
  })
  // Typed name lands on the "Printed Name: ___" line one row below.
  lastPage.drawText(input.signer_name.trim(), {
    x: anchor.x,
    y: anchor.y - 30,
    size: 10,
    font: helv,
  })
  // Date goes on the inline "Date: ___" slot to the right of the
  // signature (only the Homeowner and Contractor Acceptance rows have
  // a Date slot; the Rep Signature row doesn't, so we skip it for
  // company signs).
  if (signerRole !== 'company') {
    lastPage.drawText(new Date().toISOString().slice(0, 10), {
      x: anchor.x + sigWidth + 60,
      y: anchor.y,
      size: 10,
      font: helv,
    })
  }

  const signedBytes = await pdf.save()
  const sha256 = await sha256Hex(signedBytes)

  // 5. Upload signed bytes + raw signature PNG.
  //
  // Both paths use `upsert: true` because a two-party flow writes
  // here twice: once on the company sign, again on the homeowner
  // sign. The signature PNG path includes the signer role so we keep
  // both originals when a doc gets signed by two parties.
  const signedStoragePath = `${original.tenant_id}/documents/${original.prospect_id}/${original.id}-signed.pdf`
  const signaturePath = signerRole === 'company'
    ? `${original.tenant_id}/${original.id}-company.png`
    : `${original.tenant_id}/${original.id}.png`

  const { error: upSignedErr } = await supabase.storage
    .from('documents')
    .upload(signedStoragePath, signedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upSignedErr) {
    return jsonError(500, 'signed_upload_failed', upSignedErr.message)
  }

  const { error: upSigErr } = await supabase.storage
    .from('signatures')
    .upload(signaturePath, sigBytes, {
      contentType: 'image/png',
      upsert: true,
    })
  if (upSigErr) {
    return jsonError(500, 'signature_png_upload_failed', upSigErr.message)
  }

  // 6. Update the row.
  //
  // `signed_at` / `signed_by` reflect the FINAL sign only (homeowner),
  // so the company-sign step doesn't masquerade as the final
  // approval. The company audit trail lives in `activities` plus the
  // separate signature PNG path.
  const updateAt = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status: finalStatus,
    signed_storage_path: signedStoragePath,
    signature_url: signaturePath,
  }
  if (finalStatus === 'signed') {
    updates.signed_at = updateAt
    updates.signed_by = user.id
  }
  await supabase.from('documents').update(updates).eq('id', original.id)

  return jsonOk({
    signed_document: {
      id: original.id,
      storage_path: signedStoragePath,
      sha256,
      status: finalStatus,
      signer_name: input.signer_name.trim(),
      signer_role: signerRole,
      signed_at: finalStatus === 'signed' ? updateAt : null,
      device_metadata: input.device_metadata ?? null,
    },
  })
})

export { corsHeaders }
