// Edge Function — generate-pdf
//
// Contract (blocker doc §3.4, stage-4 §4.1):
//   POST { prospect_id, template_kind, fields? }
//   -> { document: { id, storage_path, sha256, page_count, status } }
//
// Storage path: documents/{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf
//
// This is a minimal but correct implementation: it enforces auth, role,
// tenant scoping, writes a real PDF (placeholder body) via pdf-lib, and
// inserts the `documents` row. Template prose comes in a follow-up PR
// per stage-4 §4.4 (legal text owned by the product owner).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

import {
  corsHeaders,
  getAuthedUser,
  jsonError,
  jsonOk,
  preflight,
} from '../_shared/auth.ts'

type TemplateKind = '3rd_party_auth' | 'acv_contract' | 'rcv_contract' | 'supplement'

const ALLOWED_KINDS: TemplateKind[] = [
  '3rd_party_auth',
  'acv_contract',
  'rcv_contract',
  'supplement',
]

const ALLOWED_ROLES = ['telefonista', 'admin', 'owner', 'super_admin']

const TEMPLATE_TITLES: Record<TemplateKind, string> = {
  '3rd_party_auth': '3rd Party Authorization',
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

  // 2. Pre-create the documents row so we have an id for the storage path.
  const { data: doc, error: dErr } = await supabase
    .from('documents')
    .insert({
      tenant_id: prospect.tenant_id,
      prospect_id: prospect.id,
      type: input.template_kind,
      status: 'generated',
      created_by: user.id,
      template_data: input.fields ?? {},
    })
    .select('id')
    .single()
  if (dErr || !doc) return jsonError(500, 'db_insert_failed', dErr?.message)

  // 3. Render the PDF. The 3rd_party_auth template carries the real
  //    UPPA-compliant body; ACV/RCV/Supplement still ship scaffolding
  //    text pending product owner sign-off.
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN_X = 48
  const CONTENT_W = PAGE_W - MARGIN_X * 2
  const TOP_AFTER_HEADER = 700 // first page only; later pages get a slim band
  const TOP_AFTER_BAND = 740
  const BOTTOM_FLOOR = 200 // last-page signature block + footer live below this
  const BOTTOM_FOOTER = 30
  const ORANGE = rgb(0xe8 / 0xff, 0x50 / 0xff, 0x1f / 0xff)

  // Measure-aware paginating renderer.
  const pages: ReturnType<typeof pdf.addPage>[] = []
  let curPage: ReturnType<typeof pdf.addPage>
  let y = 0
  let pageIndex = -1

  function drawHeader(p: ReturnType<typeof pdf.addPage>, isFirst: boolean) {
    if (isFirst) {
      p.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: ORANGE })
      p.drawText(TEMPLATE_TITLES[input.template_kind!], {
        x: MARGIN_X,
        y: PAGE_H - 40,
        size: 18,
        font: helvBold,
        color: rgb(1, 1, 1),
      })
    } else {
      p.drawRectangle({ x: 0, y: PAGE_H - 24, width: PAGE_W, height: 24, color: ORANGE })
      p.drawText(TEMPLATE_TITLES[input.template_kind!], {
        x: MARGIN_X,
        y: PAGE_H - 17,
        size: 9,
        font: helvBold,
        color: rgb(1, 1, 1),
      })
    }
  }

  function drawFooter(p: ReturnType<typeof pdf.addPage>, n: number, total: number) {
    p.drawText('Electronically generated via Roof-Aid CRM', {
      x: MARGIN_X,
      y: BOTTOM_FOOTER,
      size: 8,
      font: helv,
      color: rgb(0.4, 0.4, 0.4),
    })
    p.drawText(`Page ${n} of ${total}`, {
      x: PAGE_W - MARGIN_X - 60,
      y: BOTTOM_FOOTER,
      size: 8,
      font: helv,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  function newPage() {
    curPage = pdf.addPage([PAGE_W, PAGE_H])
    pages.push(curPage)
    pageIndex += 1
    const isFirst = pageIndex === 0
    drawHeader(curPage, isFirst)
    y = isFirst ? TOP_AFTER_HEADER : TOP_AFTER_BAND
  }

  // Word-wrap that respects actual font width.
  function wrap(text: string, size: number, font: typeof helv, maxW: number): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w
      const wText = font.widthOfTextAtSize(candidate, size)
      if (wText > maxW && cur) {
        lines.push(cur)
        cur = w
      } else {
        cur = candidate
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  type TextOpts = {
    size?: number
    bold?: boolean
    italic?: boolean
    indent?: number
    color?: ReturnType<typeof rgb>
    reserveBottom?: number // override BOTTOM_FLOOR for normal flow
  }

  function ensureSpace(need: number, reserveBottom = 120) {
    if (y - need < reserveBottom) {
      newPage()
    }
  }

  function drawParagraph(text: string, opts: TextOpts = {}) {
    const size = opts.size ?? 10.5
    const font = opts.bold ? helvBold : opts.italic ? helvItalic : helv
    const indent = opts.indent ?? 0
    const x = MARGIN_X + indent
    const maxW = CONTENT_W - indent
    const lineHeight = size + 4
    const lines = wrap(text, size, font, maxW)
    for (const line of lines) {
      ensureSpace(lineHeight, opts.reserveBottom ?? 120)
      curPage.drawText(line, {
        x,
        y,
        size,
        font,
        color: opts.color ?? rgb(0.12, 0.12, 0.12),
      })
      y -= lineHeight
    }
  }

  function bullet(text: string, opts: TextOpts = {}) {
    const size = opts.size ?? 10.5
    const indent = (opts.indent ?? 0) + 14
    const lineHeight = size + 4
    ensureSpace(lineHeight, opts.reserveBottom ?? 120)
    curPage.drawText('•', { x: MARGIN_X + (opts.indent ?? 0) + 4, y, size, font: helv })
    drawParagraph(text, { ...opts, indent })
  }

  function heading(text: string) {
    ensureSpace(22, 140)
    y -= 6
    curPage.drawText(text, { x: MARGIN_X, y, size: 12, font: helvBold })
    y -= 16
  }

  function spacer(n = 8) {
    y -= n
  }

  function fieldLine(label: string, value: string, opts: { bold?: boolean } = {}) {
    const size = 11
    const lineHeight = size + 6
    ensureSpace(lineHeight)
    const labelText = `${label}: `
    curPage.drawText(labelText, { x: MARGIN_X, y, size, font: helvBold })
    const lw = helvBold.widthOfTextAtSize(labelText, size)
    curPage.drawText(value, {
      x: MARGIN_X + lw,
      y,
      size,
      font: opts.bold ? helvBold : helv,
    })
    y -= lineHeight
  }

  newPage()

  // Common fields
  const homeowner = prospect.name ?? '—'
  const address = [prospect.address, prospect.city, prospect.state, prospect.zip]
    .filter(Boolean)
    .join(', ')
  const fields = (input.fields ?? {}) as Record<string, unknown>
  const insurance = (fields.insurance_company as string | undefined) ?? ''
  const claim = (fields.claim_number as string | undefined) ?? ''
  const lossDate = (fields.loss_date as string | undefined) ?? ''
  const deductible = (fields.deductible as number | undefined)?.toFixed?.(2) ?? ''
  const totalJobCost = (fields.total_job_cost as number | undefined)?.toFixed?.(2) ?? ''
  const scope = (fields.scope_of_work as string | undefined) ?? ''
  const todayIso = new Date().toISOString().slice(0, 10)
  const tenantName = 'Roof AID' // TODO: load from tenants row in a follow-up

  // -----------------------------------------------------------------
  // Body — per template_kind
  // -----------------------------------------------------------------
  if (input.template_kind === '3rd_party_auth') {
    // Header info block (top metadata)
    fieldLine('Claim number', claim || '________________________________')
    fieldLine('Date of loss', lossDate || '________________________________')
    fieldLine('Date', todayIso)
    spacer(4)
    fieldLine('Homeowner(s)', homeowner, { bold: true })
    fieldLine('Property Address', address || '________________________________')
    fieldLine('Contractor', tenantName)
    spacer(6)

    heading('1. Purpose of Agreement')
    drawParagraph(
      `Homeowner authorizes ${tenantName} to inspect, document, photograph, and evaluate the property solely ` +
        'for the purpose of preparing a construction estimate and determining the scope of repairs required ' +
        'due to the reported loss.',
    )
    spacer(4)
    drawParagraph('Not an Insurance Adjusting Agreement', { bold: true })
    drawParagraph(
      `${tenantName} is not a public adjuster and does not provide services that constitute the interpretation ` +
        'of insurance policy coverage, negotiation of claim settlements, or representation of the Homeowner ' +
        'in an adjusting capacity.',
    )

    heading('2. Authorization to Communicate with Insurance Carrier')
    drawParagraph(
      `The Homeowner authorizes ${tenantName} to communicate with the insurance company ONLY regarding:`,
    )
    bullet('Construction scope of work')
    bullet('Contractor pricing')
    bullet('Required materials and labor')
    bullet('Building code–required items')
    bullet('Documentation of damages')
    spacer(4)
    drawParagraph(
      `${tenantName} may submit contractor documentation, photos, measurements, estimates, and requests for ` +
        'review of omitted construction items ("supplement requests"). All insurance coverage decisions ' +
        'remain exclusively between the Homeowner and the insurance carrier.',
    )

    heading('3. Contractor Scope & Pricing')
    drawParagraph(
      `In the event the insurance carrier approves the claim, this Agreement becomes a construction contract. ` +
        `${tenantName} will perform repairs for the approved insurance scope amount, plus deductible and any ` +
        'non-covered items elected by the Homeowner.',
    )

    heading('4. Cancellation')
    drawParagraph(
      `If the Homeowner cancels after ${tenantName} has performed inspection, documentation, or ` +
        `construction-related services, Homeowner agrees to compensate ${tenantName} for the reasonable value ` +
        'of those services. This is NOT a fee for claim adjusting and does not relate to coverage or ' +
        'settlement negotiation.',
    )

    heading('5. Release of Insurance Funds')
    drawParagraph(
      `Homeowner agrees to provide ${tenantName} with all applicable insurance proceeds for the work ` +
        `${tenantName} performs. Insurance checks payable to the Homeowner and Contractor must be endorsed ` +
        'and released upon receipt.',
    )

    heading('6. UPPA Compliance Notice')
    drawParagraph(`${tenantName} is not a public insurance adjuster. ${tenantName} does not:`)
    bullet('Interpret or explain insurance policy coverage')
    bullet('Negotiate insurance settlements')
    bullet('Act on behalf of the Homeowner in adjusting a claim')
    spacer(4)
    drawParagraph(
      `${tenantName}'s role is strictly limited to construction services and providing documentation ` +
        'necessary for the insurer to evaluate required repairs.',
    )
    spacer(4)
    drawParagraph(
      `If the Homeowner terminates this Agreement after ${tenantName} has received the initial ACV payment ` +
        'or otherwise cancels the work, the Homeowner agrees to compensate ' +
        `${tenantName} for all work performed up to termination, including inspections, photographs, ` +
        'documentation, estimates, and communication/negotiation with the insurance company.',
    )
    spacer(4)
    drawParagraph('Compensation Amount: The greater of:', { bold: true })
    bullet('Flat fee of $4,000, or')
    bullet('25% of total approved insurance claim (RCV + Supplements).')
    spacer(2)
    drawParagraph(
      'Payment is due immediately upon termination. This fee is not a penalty, but a fair estimate of ' +
        'services rendered.',
      { italic: true },
    )

    // Section 7 — signatures. These need to fit on the LAST page above
    // the embed-signature anchor at y=120. Force a page break if there
    // isn't room for the whole section.
    const SIG_BLOCK_HEIGHT = 200
    if (y - SIG_BLOCK_HEIGHT < 120) newPage()
    heading('7. Signatures')
  } else if (input.template_kind === 'acv_contract' || input.template_kind === 'rcv_contract') {
    const isAcv = input.template_kind === 'acv_contract'
    const valuationLabel = isAcv ? 'Actual Cash Value (ACV)' : 'Replacement Cost Value (RCV)'
    fieldLine('Homeowner', homeowner, { bold: true })
    if (address) fieldLine('Address', address)
    spacer(4)
    drawParagraph(
      `This agreement is entered into by ${homeowner} ("Homeowner") for roofing work to be performed at the ` +
        `address listed above. The scope and pricing of the work are determined by the ${valuationLabel} ` +
        "methodology used by the homeowner's insurance carrier.",
    )
    spacer(4)
    fieldLine('Insurance carrier', insurance || '________________________________')
    fieldLine('Claim #', claim || '________________________________')
    fieldLine('Deductible', deductible ? `$${deductible}` : '________________________________')
    fieldLine('Total job cost', totalJobCost ? `$${totalJobCost}` : '________________________________')
    spacer(4)
    drawParagraph('Scope of work:', { bold: true })
    drawParagraph(
      scope ||
        'See attached estimate. Work to include tear-off and replacement of damaged roofing materials in ' +
          'accordance with carrier-approved scope, repair of incidental damage, and final clean-up.',
    )
    spacer(6)
    drawParagraph(
      'The Homeowner agrees that the contractor may receive payment directly from the insurance carrier ' +
        'where permitted, and assigns the insurance proceeds for the covered scope to the contractor in ' +
        'accordance with applicable law.',
    )
  } else {
    heading('Supplement Document')
    drawParagraph(
      'A formal supplement claim attached to the homeowner contract. Detailed line items are enumerated ' +
        'in the accompanying scope.',
    )
  }

  // -----------------------------------------------------------------
  // Signature block — embed-signature stamps the homeowner signature at
  // (60, 120) on the LAST page, so the homeowner line MUST be there.
  // -----------------------------------------------------------------
  const lastPage = pages[pages.length - 1]
  const sigY = 120
  const sigLabelSize = 8
  const sigLineLen = 230
  const drawSigSlot = (label: string, x: number, yPos: number) => {
    lastPage.drawLine({
      start: { x, y: yPos },
      end: { x: x + sigLineLen, y: yPos },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    })
    lastPage.drawText(label, {
      x,
      y: yPos - 12,
      size: sigLabelSize,
      font: helv,
      color: rgb(0.35, 0.35, 0.35),
    })
  }

  // Homeowner (gets the digital signature)
  drawSigSlot('Homeowner signature', 60, sigY)
  drawSigSlot('Date', 320, sigY)
  // Hidden marker (legacy — embed-signature uses fixed coords, kept for forward compat)
  lastPage.drawText(`<<sig:home:60,${sigY}>>`, {
    x: 0,
    y: 0,
    size: 0.001,
    color: rgb(1, 1, 1),
    font: helv,
  })

  // Co-Homeowner (if applicable) — physical sign offline for now
  drawSigSlot('Co-Homeowner signature (if applicable)', 60, sigY - 50)
  drawSigSlot('Date', 320, sigY - 50)

  // Contractor representative
  drawSigSlot('Contractor / Roof AID representative', 60, sigY - 100)
  drawSigSlot('Date', 320, sigY - 100)

  // Footers on every page
  const totalPages = pages.length
  pages.forEach((p, i) => drawFooter(p, i + 1, totalPages))

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

  await supabase
    .from('documents')
    .update({
      storage_path: storagePath,
      sha256,
      page_count: pdf.getPageCount(),
    })
    .eq('id', doc.id)

  return jsonOk({
    document: {
      id: doc.id,
      storage_path: storagePath,
      sha256,
      page_count: pdf.getPageCount(),
      status: 'generated',
    },
  })
})

// Re-export to silence "unused" warnings during linting.
export { corsHeaders }
