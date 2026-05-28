// Render a block-JSON template document to PDF using pdf-lib.
//
// This is intentionally a subset of ProseMirror so the renderer is a
// straightforward switch over block.type. The web app's
// apps/web/lib/templates/blocks.ts produces the same shape.

import { PDFDocument, PDFFont, PDFPage, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

export type InlineMark = 'bold' | 'italic' | 'underline'

export interface InlineSpan {
  text: string
  marks?: InlineMark[]
}

export interface TableCell {
  spans: InlineSpan[]
  header?: boolean
}
export interface TableRow {
  cells: TableCell[]
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'bullet'; level?: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: 'ordered'; level?: 1 | 2 | 3; index: number; spans: InlineSpan[] }
  | { type: 'table'; rows: TableRow[] }
  | {
      type: 'image'
      src: string
      storagePath?: string
      alt?: string
      width?: number
      height?: number
    }
  | { type: 'spacer' }

/** Legacy: rich content for a single section's body. */
export interface RichContent {
  blocks: Block[]
}

/** Section-based template document. Top-level shape persisted in
 *  document_template_versions.content. */
export interface Section {
  id: string
  title: string
  content: Block[]
}

export interface TemplateDoc {
  sections: Section[]
}

/** Normalize legacy {blocks:[...]} payload into the new shape. */
export function normalizeTemplateDoc(raw: unknown): TemplateDoc {
  if (!raw || typeof raw !== 'object') return { sections: [] }
  const r = raw as Record<string, unknown>
  if (Array.isArray(r.sections)) {
    return {
      sections: (r.sections as Section[]).map((s) => ({
        id: typeof s.id === 'string' ? s.id : `s-${Math.random().toString(36).slice(2)}`,
        title: typeof s.title === 'string' ? s.title : '',
        content: Array.isArray(s.content) ? (s.content as Block[]) : [],
      })),
    }
  }
  if (Array.isArray(r.blocks)) {
    return {
      sections: [
        {
          id: `s-${Math.random().toString(36).slice(2)}`,
          title: '',
          content: r.blocks as Block[],
        },
      ],
    }
  }
  return { sections: [] }
}

export interface RenderContext {
  pdf: PDFDocument
  pages: PDFPage[]
  helv: PDFFont
  helvBold: PDFFont
  helvItalic: PDFFont
  state: { curPage: PDFPage; y: number; pageIndex: number }
  pageW: number
  pageH: number
  marginX: number
  contentW: number
  topAfterHeader: number
  topAfterBand: number
  reserveBottom: number
  drawHeader: (p: PDFPage, isFirst: boolean) => void
  title: string
}

function newPage(ctx: RenderContext) {
  const page = ctx.pdf.addPage([ctx.pageW, ctx.pageH])
  ctx.pages.push(page)
  ctx.state.pageIndex += 1
  ctx.state.curPage = page
  const isFirst = ctx.state.pageIndex === 0
  ctx.drawHeader(page, isFirst)
  ctx.state.y = isFirst ? ctx.topAfterHeader : ctx.topAfterBand
}

function ensureSpace(ctx: RenderContext, need: number) {
  if (ctx.state.y - need < ctx.reserveBottom) {
    newPage(ctx)
  }
}

function fontFor(ctx: RenderContext, marks: InlineMark[] = []): PDFFont {
  if (marks.includes('bold')) return ctx.helvBold
  if (marks.includes('italic')) return ctx.helvItalic
  return ctx.helv
}

// Word-wrap an array of inline spans into laid-out lines, respecting font
// switches for marks. Returns lines as { x, segments: [{text, font, size}] }.
interface LaidOutSegment {
  text: string
  font: PDFFont
  size: number
  underline: boolean
}
interface LaidOutLine {
  segments: LaidOutSegment[]
  width: number
}

function layoutInline(
  ctx: RenderContext,
  spans: InlineSpan[],
  size: number,
  maxW: number,
): LaidOutLine[] {
  const lines: LaidOutLine[] = []
  let curr: LaidOutLine = { segments: [], width: 0 }
  let needsLeadingSpace = false

  function pushLine() {
    lines.push(curr)
    curr = { segments: [], width: 0 }
    needsLeadingSpace = false
  }

  for (const span of spans) {
    const font = fontFor(ctx, span.marks)
    const underline = span.marks?.includes('underline') ?? false
    // Split on whitespace BUT keep `\n` as its own token so we can emit a
    // forced break. The author writes `\n` (markdown hard break) when they
    // want a single labeled field block like "Date: ___" + "Address: ___"
    // to stay together as one paragraph.
    const tokens = span.text.split(/(\n|\s+)/)
    for (const tok of tokens) {
      if (tok === '') continue
      if (tok === '\n') {
        pushLine()
        continue
      }
      const isWS = /^\s+$/.test(tok)
      if (isWS) {
        if (curr.segments.length > 0) needsLeadingSpace = true
        continue
      }
      const prefix = needsLeadingSpace && curr.segments.length > 0 ? ' ' : ''
      const piece = prefix + tok
      const w = font.widthOfTextAtSize(piece, size)
      if (curr.width + w > maxW && curr.segments.length > 0) {
        pushLine()
        const w2 = font.widthOfTextAtSize(tok, size)
        curr.segments.push({ text: tok, font, size, underline })
        curr.width = w2
      } else {
        curr.segments.push({ text: piece, font, size, underline })
        curr.width += w
      }
      needsLeadingSpace = false
    }
  }
  if (curr.segments.length > 0 || lines.length === 0) pushLine()
  return lines
}

function drawInline(
  ctx: RenderContext,
  spans: InlineSpan[],
  size: number,
  opts: { indent?: number } = {},
) {
  const indent = opts.indent ?? 0
  const x0 = ctx.marginX + indent
  const maxW = ctx.contentW - indent
  const lineHeight = size + 4
  const lines = layoutInline(ctx, spans, size, maxW)
  for (const line of lines) {
    ensureSpace(ctx, lineHeight)
    let x = x0
    for (const seg of line.segments) {
      ctx.state.curPage.drawText(seg.text, {
        x,
        y: ctx.state.y,
        size: seg.size,
        font: seg.font,
        color: rgb(0.12, 0.12, 0.12),
      })
      const w = seg.font.widthOfTextAtSize(seg.text, seg.size)
      if (seg.underline) {
        ctx.state.curPage.drawLine({
          start: { x, y: ctx.state.y - 2 },
          end: { x: x + w, y: ctx.state.y - 2 },
          thickness: 0.5,
          color: rgb(0.12, 0.12, 0.12),
        })
      }
      x += w
    }
    ctx.state.y -= lineHeight
  }
}

// Image fetcher — the Edge Function passes a function that turns a
// storage path (or absolute URL) into bytes; lets the renderer stay
// agnostic to how the bytes are sourced.
export type ImageFetcher = (
  block: Extract<Block, { type: 'image' }>,
) => Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } | null>

export async function renderBlocks(
  ctx: RenderContext,
  blocks: Block[],
  fetchImage?: ImageFetcher,
): Promise<void> {
  for (const b of blocks) {
    if (b.type === 'spacer') {
      ctx.state.y -= 8
      continue
    }
    if (b.type === 'heading') {
      ensureSpace(ctx, 22)
      ctx.state.y -= 6
      const size = b.level === 1 ? 14 : b.level === 2 ? 12 : 11
      drawInline(
        ctx,
        b.spans.map((s) => ({
          ...s,
          marks: Array.from(new Set([...(s.marks ?? []), 'bold' as InlineMark])),
        })),
        size,
      )
      ctx.state.y -= 4
      continue
    }
    if (b.type === 'paragraph') {
      drawInline(ctx, b.spans, 10.5)
      ctx.state.y -= 2
      continue
    }
    if (b.type === 'bullet') {
      drawListItem(ctx, b.spans, b.level ?? 1, undefined)
      continue
    }
    if (b.type === 'ordered') {
      drawListItem(ctx, b.spans, b.level ?? 1, `${b.index}.`)
      continue
    }
    if (b.type === 'table') {
      drawTable(ctx, b.rows)
      continue
    }
    if (b.type === 'image') {
      if (!fetchImage) continue
      const img = await fetchImage(b)
      if (!img) continue
      const embedded =
        img.mime === 'image/png'
          ? await ctx.pdf.embedPng(img.bytes)
          : await ctx.pdf.embedJpg(img.bytes)
      const intrinsicW = embedded.width
      const intrinsicH = embedded.height
      // Scale to fit within content width while preserving aspect ratio.
      const desiredW = Math.min(b.width ?? intrinsicW, ctx.contentW)
      const scale = desiredW / intrinsicW
      const drawW = desiredW
      const drawH = intrinsicH * scale
      ensureSpace(ctx, drawH + 6)
      ctx.state.curPage.drawImage(embedded, {
        x: ctx.marginX,
        y: ctx.state.y - drawH,
        width: drawW,
        height: drawH,
      })
      ctx.state.y -= drawH + 6
      continue
    }
  }
}

function drawListItem(
  ctx: RenderContext,
  spans: InlineSpan[],
  level: number,
  numberPrefix?: string,
) {
  const size = 10.5
  const baseIndent = (level - 1) * 18
  const indent = baseIndent + 14
  const lineHeight = size + 4
  const marker = numberPrefix ?? (level === 1 ? '•' : level === 2 ? '◦' : '▪')
  ensureSpace(ctx, lineHeight)
  ctx.state.curPage.drawText(marker, {
    x: ctx.marginX + baseIndent + 4,
    y: ctx.state.y,
    size,
    font: ctx.helv,
  })
  drawInline(ctx, spans, size, { indent })
}

function drawTable(ctx: RenderContext, rows: TableRow[]) {
  if (rows.length === 0) return
  const colCount = Math.max(...rows.map((r) => r.cells.length))
  if (colCount === 0) return

  const colW = ctx.contentW / colCount
  const pad = 6
  const size = 10
  const lineHeight = size + 3
  const minRowH = lineHeight + pad * 2

  // First pass — measure each row's height.
  const rowHeights: number[] = rows.map((row) => {
    let max = minRowH
    for (let i = 0; i < colCount; i++) {
      const cell = row.cells[i]
      if (!cell) continue
      const cellW = colW - pad * 2
      // Use a "fake" line count by laying out spans against cellW and
      // counting `\n` and word-wraps approximately.
      const text = cell.spans.map((s) => s.text).join('')
      const lines = approximateLineCount(ctx, text, size, cellW)
      const h = lines * lineHeight + pad * 2
      if (h > max) max = h
    }
    return max
  })

  // Second pass — paginate and draw.
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowH = rowHeights[r]
    ensureSpace(ctx, rowH)

    const yTop = ctx.state.y
    const yBottom = yTop - rowH

    // Borders
    for (let c = 0; c < colCount; c++) {
      const x0 = ctx.marginX + c * colW
      ctx.state.curPage.drawRectangle({
        x: x0,
        y: yBottom,
        width: colW,
        height: rowH,
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.5,
      })

      const cell = row.cells[c]
      if (!cell) continue

      // Header cells get a faint background.
      if (cell.header) {
        ctx.state.curPage.drawRectangle({
          x: x0,
          y: yBottom,
          width: colW,
          height: rowH,
          color: rgb(0.95, 0.95, 0.95),
        })
      }

      // Cell text — wrap inside cellW.
      const cellSpans = cell.header
        ? cell.spans.map((s) => ({
            ...s,
            marks: Array.from(new Set([...(s.marks ?? []), 'bold' as InlineMark])),
          }))
        : cell.spans
      const cellW = colW - pad * 2
      const wrapped = layoutInline(ctx, cellSpans, size, cellW)
      let y = yTop - pad - size
      for (const line of wrapped) {
        let x = x0 + pad
        for (const seg of line.segments) {
          ctx.state.curPage.drawText(seg.text, {
            x,
            y,
            size: seg.size,
            font: seg.font,
            color: rgb(0.12, 0.12, 0.12),
          })
          const wText = seg.font.widthOfTextAtSize(seg.text, seg.size)
          if (seg.underline) {
            ctx.state.curPage.drawLine({
              start: { x, y: y - 2 },
              end: { x: x + wText, y: y - 2 },
              thickness: 0.4,
              color: rgb(0.12, 0.12, 0.12),
            })
          }
          x += wText
        }
        y -= lineHeight
      }
    }

    ctx.state.y -= rowH
  }
  ctx.state.y -= 4
}

function approximateLineCount(
  ctx: RenderContext,
  text: string,
  size: number,
  maxW: number,
): number {
  if (text === '') return 1
  const hardLines = text.split('\n')
  let total = 0
  for (const line of hardLines) {
    if (line === '') {
      total += 1
      continue
    }
    const w = ctx.helv.widthOfTextAtSize(line, size)
    total += Math.max(1, Math.ceil(w / maxW))
  }
  return total
}

// Token substitution mirrors apps/web/lib/templates/blocks.ts so the
// renderer is self-contained (Deno doesn't share npm packages with the
// web app).
const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

function substituteText(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_RE, (_, tok: string) => {
    const v = values[tok]
    return v != null && v !== '' ? v : `[${tok}]`
  })
}

function substituteBlocks(blocks: Block[], values: Record<string, string>): Block[] {
  return blocks.map((b) => {
    if (b.type === 'spacer' || b.type === 'image') return b
    if (b.type === 'table') {
      return {
        ...b,
        rows: b.rows.map((r) => ({
          cells: r.cells.map((c) => ({
            ...c,
            spans: c.spans.map((s) => ({ ...s, text: substituteText(s.text, values) })),
          })),
        })),
      }
    }
    return {
      ...b,
      spans: b.spans.map((s) => ({ ...s, text: substituteText(s.text, values) })),
    } as Block
  })
}

export function substituteTokens(
  doc: TemplateDoc,
  values: Record<string, string>,
): TemplateDoc {
  return {
    sections: doc.sections.map((sec) => ({
      ...sec,
      title: substituteText(sec.title, values),
      content: substituteBlocks(sec.content, values),
    })),
  }
}

// Factories shared with generate-pdf/index.ts -------------------------------
export function createStandardContext(opts: {
  pdf: PDFDocument
  helv: PDFFont
  helvBold: PDFFont
  helvItalic: PDFFont
  title: string
}): RenderContext {
  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN_X = 48
  const ORANGE = rgb(0xe8 / 0xff, 0x50 / 0xff, 0x1f / 0xff)

  const ctx: RenderContext = {
    pdf: opts.pdf,
    pages: [],
    helv: opts.helv,
    helvBold: opts.helvBold,
    helvItalic: opts.helvItalic,
    state: { curPage: undefined as unknown as PDFPage, y: 0, pageIndex: -1 },
    pageW: PAGE_W,
    pageH: PAGE_H,
    marginX: MARGIN_X,
    contentW: PAGE_W - MARGIN_X * 2,
    topAfterHeader: 700,
    topAfterBand: 740,
    reserveBottom: 60, // just enough for the footer; signature block
    // handles its own pagination by calling newPage if it doesn't fit.
    title: opts.title,
    drawHeader: (p: PDFPage, isFirst: boolean) => {
      if (isFirst) {
        p.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: ORANGE })
        p.drawText(opts.title, {
          x: MARGIN_X,
          y: PAGE_H - 40,
          size: 18,
          font: opts.helvBold,
          color: rgb(1, 1, 1),
        })
      } else {
        p.drawRectangle({ x: 0, y: PAGE_H - 24, width: PAGE_W, height: 24, color: ORANGE })
        p.drawText(opts.title, {
          x: MARGIN_X,
          y: PAGE_H - 17,
          size: 9,
          font: opts.helvBold,
          color: rgb(1, 1, 1),
        })
      }
    },
  }
  newPage(ctx)
  return ctx
}

export function ensureNewPageIfShortOnSpace(ctx: RenderContext, need: number) {
  if (ctx.state.y - need < 120) newPage(ctx)
}

// ---------------------------------------------------------------------------
// Section + fixed-header / fixed-footer rendering
// ---------------------------------------------------------------------------

export interface HeaderFields {
  claim_number?: string
  loss_date?: string
  today?: string
  homeowner_name?: string
  property_address?: string
  contractor_name?: string
}

/** Render the fixed top metadata block at the current y. */
export function renderTemplateHeader(ctx: RenderContext, fields: HeaderFields) {
  const labelFont = ctx.helvBold
  const valueFont = ctx.helv
  const size = 11
  const lineHeight = size + 6

  function fieldLine(label: string, value: string, opts: { boldValue?: boolean } = {}) {
    ensureSpace(ctx, lineHeight)
    const labelText = `${label}: `
    ctx.state.curPage.drawText(labelText, {
      x: ctx.marginX,
      y: ctx.state.y,
      size,
      font: labelFont,
    })
    const lw = labelFont.widthOfTextAtSize(labelText, size)
    ctx.state.curPage.drawText(value, {
      x: ctx.marginX + lw,
      y: ctx.state.y,
      size,
      font: opts.boldValue ? ctx.helvBold : valueFont,
    })
    ctx.state.y -= lineHeight
  }

  const FILL = '________________________________'
  fieldLine('Claim number', fields.claim_number || FILL)
  fieldLine('Date of loss', fields.loss_date || FILL)
  fieldLine('Date', fields.today || FILL)
  ctx.state.y -= 4
  fieldLine('Homeowner(s)', fields.homeowner_name || FILL, { boldValue: true })
  fieldLine('Property Address', fields.property_address || FILL)
  fieldLine('Contractor', fields.contractor_name || FILL)
  ctx.state.y -= 8
}

/** Render the section list with auto-numbered titles. */
export async function renderSections(
  ctx: RenderContext,
  sections: Section[],
  fetchImage?: ImageFetcher,
) {
  let n = 1
  for (const sec of sections) {
    // Title (heading-like)
    const lines = sec.title.split('\n')
    ensureSpace(ctx, 26)
    ctx.state.y -= 6
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prefix = i === 0 ? `${n}. ` : ''
      const text = prefix + line
      ensureSpace(ctx, 18)
      ctx.state.curPage.drawText(text, {
        x: ctx.marginX,
        y: ctx.state.y,
        size: 13,
        font: ctx.helvBold,
      })
      ctx.state.y -= 18
    }
    ctx.state.y -= 2
    await renderBlocks(ctx, sec.content, fetchImage)
    ctx.state.y -= 6
    n += 1
  }
}

/** Coordinates the embed-signature function uses to place a signature
 *  PNG on the LAST page. Returned so the caller can persist them on
 *  the document row. */
export interface SignatureAnchor {
  x: number
  y: number
  width: number
}

/** All signature anchors the renderer can stamp on the document. */
export interface SignatureAnchors {
  homeowner: SignatureAnchor
  /** The "{TenantName} Representative Signature" slot — used when a
   *  company-side user (owner/admin) signs. */
  rep: SignatureAnchor
}

/** Render the fixed signature block on the LAST page in the same
 *  inline-label style as the printed legal template:
 *
 *    7. Signatures
 *    Homeowner Signature: ___________ Date: ___________
 *    Printed Name: ___________________
 *    Co-Homeowner Signature (if applicable): _______ Date: _______
 *    Printed Name: ___________________
 *    Contractor Acceptance: ___________ Date: ___________
 *    Roof AID Representative Signature: ___________________
 *    Printed Name: ___________________
 *
 *  Returns the (x, y) where the homeowner signature line lives so
 *  embed-signature can drop the signature PNG on the line.
 */
export function renderSignatureBlock(
  ctx: RenderContext,
  tenantName: string,
): SignatureAnchors {
  // The whole block runs from the horizontal rule (y=385) down to the
  // last printed-name line (y=95). If the current y is above y=395 the
  // body content would overlap the rule — start a fresh page.
  if (ctx.state.y < 395) newPage(ctx)

  const page = ctx.state.curPage
  const labelSize = 11
  const lineLen = 220

  // Horizontal rule + heading at the top of the block.
  const ruleY = 385
  page.drawLine({
    start: { x: ctx.marginX, y: ruleY },
    end: { x: ctx.pageW - ctx.marginX, y: ruleY },
    thickness: 1.2,
    color: rgb(0, 0, 0),
  })
  page.drawText('7.  Signatures', {
    x: ctx.marginX,
    y: ruleY - 22,
    size: 14,
    font: ctx.helvBold,
  })

  // Helper: draw "Label: ____________________" inline. Returns the
  // x coordinate where the underline begins (used to anchor the
  // signature image on the homeowner row).
  const drawInline = (
    label: string,
    x: number,
    y: number,
    len: number,
  ): number => {
    page.drawText(label, { x, y, size: labelSize, font: ctx.helvBold })
    const labelW = ctx.helvBold.widthOfTextAtSize(label, labelSize)
    const lineX = x + labelW + 2
    page.drawLine({
      start: { x: lineX, y: y - 2 },
      end: { x: lineX + len, y: y - 2 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    })
    return lineX
  }

  // Vertical layout (top → bottom, page coords with y=0 at the bottom).
  // Block bottom is well above the footer (y=30).
  const yHomeownerSig = 310
  const yHomeownerName = 280
  const yCoHomeownerSig = 240
  const yCoHomeownerName = 210
  const yContractorAcceptance = 170
  const yRepSig = 130
  const yRepName = 95
  const DATE_LABEL_OFFSET = lineLen + 36

  // 1. Homeowner Signature: ____________ Date: ____________
  const homeSigX = drawInline('Homeowner Signature:', ctx.marginX, yHomeownerSig, lineLen)
  drawInline(
    'Date:',
    homeSigX + lineLen + 20,
    yHomeownerSig,
    100,
  )
  // 1a. Printed Name: ____________________
  drawInline('Printed Name:', ctx.marginX, yHomeownerName, lineLen + 60)

  // 2. Co-Homeowner Signature (if applicable): ____ Date: ____
  drawInline(
    'Co-Homeowner Signature (if applicable):',
    ctx.marginX,
    yCoHomeownerSig,
    150,
  )
  page.drawText('Date:', {
    x: ctx.marginX + DATE_LABEL_OFFSET + 60,
    y: yCoHomeownerSig,
    size: labelSize,
    font: ctx.helvBold,
  })
  const dateLineStart =
    ctx.marginX +
    DATE_LABEL_OFFSET +
    60 +
    ctx.helvBold.widthOfTextAtSize('Date:', labelSize) +
    2
  page.drawLine({
    start: { x: dateLineStart, y: yCoHomeownerSig - 2 },
    end: { x: dateLineStart + 60, y: yCoHomeownerSig - 2 },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  })
  drawInline('Printed Name:', ctx.marginX, yCoHomeownerName, lineLen + 60)

  // 3. Contractor Acceptance: ____________ Date: ____________
  const conSigX = drawInline(
    'Contractor Acceptance:',
    ctx.marginX,
    yContractorAcceptance,
    lineLen,
  )
  drawInline('Date:', conSigX + lineLen + 20, yContractorAcceptance, 100)

  // 4. {Tenant} Representative Signature: ____________________
  const repSigX = drawInline(
    `${tenantName} Representative Signature:`,
    ctx.marginX,
    yRepSig,
    lineLen,
  )
  drawInline('Printed Name:', ctx.marginX, yRepName, lineLen + 60)

  // Hidden anchors — kept for forward-compat with embed-signature.
  page.drawText(
    `<<sig:home:${homeSigX},${yHomeownerSig}>><<sig:rep:${repSigX},${yRepSig}>>`,
    {
      x: 0,
      y: 0,
      size: 0.001,
      color: rgb(1, 1, 1),
      font: ctx.helv,
    },
  )

  return {
    homeowner: { x: homeSigX, y: yHomeownerSig, width: lineLen },
    rep: { x: repSigX, y: yRepSig, width: lineLen },
  }
}

/** Draw page-N-of-M footer on every page. Call after all body work
 *  so we know the total page count. */
export function drawFooters(ctx: RenderContext) {
  const total = ctx.pages.length
  ctx.pages.forEach((p, i) => {
    p.drawText('Electronically generated via Roof-Aid CRM', {
      x: ctx.marginX,
      y: 30,
      size: 8,
      font: ctx.helv,
      color: rgb(0.4, 0.4, 0.4),
    })
    p.drawText(`Page ${i + 1} of ${total}`, {
      x: ctx.pageW - ctx.marginX - 60,
      y: 30,
      size: 8,
      font: ctx.helv,
      color: rgb(0.4, 0.4, 0.4),
    })
  })
}
