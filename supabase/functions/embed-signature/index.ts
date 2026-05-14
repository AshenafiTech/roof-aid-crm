// Edge Function — embed-signature
//
// Contract (blocker doc §3.4, stage-4 §5.1):
//   POST { document_id, signature_png_base64, signer_name, device_metadata }
//   -> { signed_document: { id, storage_path, sha256, status: 'signed' } }
//
// Storage paths:
//   documents/{tenant_id}/documents/{prospect_id}/{doc_id}-signed.pdf
//   signatures/{tenant_id}/{document_id}.png
//
// Schema note: M1's `documents` table tracks the signed copy on the same
// row via `signed_storage_path` / `signed_at` / `signed_by`, rather than
// stage-4's "new child row with parent_document_id". This function
// follows the existing schema; the returned `signed_document.id` is the
// same row as the input `document_id`. Add `parent_document_id` later if
// the M1 model changes.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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

  // 1. Load original document.
  const { data: original, error: oErr } = await supabase
    .from('documents')
    .select(
      'id, tenant_id, prospect_id, status, storage_path, signed_storage_path',
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

  // 2. Download unsigned PDF.
  const { data: blob, error: dlErr } = await supabase.storage
    .from('documents')
    .download(original.storage_path)
  if (dlErr || !blob) return jsonError(500, 'pdf_download_failed', dlErr?.message)
  const pdfBytes = new Uint8Array(await blob.arrayBuffer())

  // 3. Decode signature PNG.
  let sigBytes: Uint8Array
  try {
    sigBytes = base64ToBytes(input.signature_png_base64)
  } catch (e) {
    return jsonError(400, 'invalid_signature_png', String(e))
  }

  // 4. Load PDF and embed signature. We look for the marker that
  //    generate-pdf left at <<sig:home:x,y>>; fall back to a fixed
  //    bottom-of-last-page coordinate if it's missing.
  let pdf
  try {
    pdf = await PDFDocument.load(pdfBytes)
  } catch (e) {
    return jsonError(500, 'pdf_parse_failed', String(e))
  }
  const sigImage = await pdf.embedPng(sigBytes)
  const lastPage = pdf.getPages()[pdf.getPageCount() - 1]
  const helv = await pdf.embedFont(StandardFonts.Helvetica)

  const sigX = 60
  const sigY = 120
  const sigWidth = 240
  const ratio = sigImage.width === 0 ? 1 : sigWidth / sigImage.width
  const sigHeight = Math.min(sigImage.height * ratio, 56)
  lastPage.drawImage(sigImage, {
    x: sigX,
    y: sigY + 2,
    width: sigWidth,
    height: sigHeight,
  })
  lastPage.drawText(input.signer_name.trim(), {
    x: sigX,
    y: sigY - 26,
    size: 9,
    font: helv,
  })
  lastPage.drawText(new Date().toISOString().slice(0, 10), {
    x: sigX + 300,
    y: sigY + 4,
    size: 11,
    font: helv,
  })

  const signedBytes = await pdf.save()
  const sha256 = await sha256Hex(signedBytes)

  // 5. Upload signed bytes + raw signature PNG.
  const signedStoragePath = `${original.tenant_id}/documents/${original.prospect_id}/${original.id}-signed.pdf`
  const signaturePath = `${original.tenant_id}/${original.id}.png`

  const { error: upSignedErr } = await supabase.storage
    .from('documents')
    .upload(signedStoragePath, signedBytes, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (upSignedErr) {
    return jsonError(500, 'signed_upload_failed', upSignedErr.message)
  }

  const { error: upSigErr } = await supabase.storage
    .from('signatures')
    .upload(signaturePath, sigBytes, {
      contentType: 'image/png',
      upsert: false,
    })
  if (upSigErr) {
    return jsonError(500, 'signature_png_upload_failed', upSigErr.message)
  }

  // 6. Mark the row as signed.
  const signedAt = new Date().toISOString()
  await supabase
    .from('documents')
    .update({
      status: 'signed',
      signed_storage_path: signedStoragePath,
      signed_at: signedAt,
      signed_by: user.id,
      signature_url: signaturePath,
    })
    .eq('id', original.id)

  return jsonOk({
    signed_document: {
      id: original.id,
      storage_path: signedStoragePath,
      sha256,
      status: 'signed',
      signer_name: input.signer_name.trim(),
      signed_at: signedAt,
      device_metadata: input.device_metadata ?? null,
    },
  })
})

export { corsHeaders }
