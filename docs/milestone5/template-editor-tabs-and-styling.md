# Template editor — Edit/Preview tabs + document-style preview

## Purpose
Two related changes:
1. **Editor UX** — owner wanted to bounce between editing and previewing without leaving the page or losing in-flight edits, and to save whenever they're ready.
2. **Visual fidelity** — preview should resemble the real generated document (sample provided by the owner) so what they see in the editor matches what the prospect will see.

## Editor (Edit ↔ Preview tabs)
- [apps/web/components/admin/template-editor.tsx](apps/web/components/admin/template-editor.tsx)
  - Replaced the modal "Preview" button with a tabbed surface: **Edit** and **Preview** tabs share the same `sections` state.
  - Both tabs use `forceMount` with `data-[state=inactive]:hidden` so the editor (TipTap instances) stays mounted when switching to Preview — focus, cursor, and undo history all survive the round trip.
  - Save / Save+publish / Revert / Change summary live in a sticky footer beneath the tabs, always visible regardless of which tab is active, so the author can publish from either view.
  - Removed `TemplatePreviewDialog` usage and the `previewOpen` state — tab supersedes the modal.

## Preview styling (mirror the reference document)
- [apps/web/components/admin/template-preview.tsx](apps/web/components/admin/template-preview.tsx)
  - **Watermark** — diagonal tiled text-only watermark per page: "ROOF AID" wordmark + "AI Driven, Built by Roofers." / "Maximum Revenue." tagline in low-contrast gray. Rendered behind content via absolute positioning + rotate-[-24deg]; `pointer-events-none`, `select-none`, `aria-hidden`. No image asset required.
  - **Typography** — switched body to sans-serif (`font-sans`) at 13px to match the screenshot; title at 15px bold centered; section headings 15px bold, numbered (`1. Purpose of Agreement` style).
  - **Document title** — per-kind override (e.g. "Third-Party Authorization & Contractor Communication Agreement" for `3rd_party_auth`) since the long-form legal title differs from the navigation label. Falls back to the short `TEMPLATE_TITLES` value.
  - **Header metadata** — preserved the previous "label + dashed fillable line" layout; labels now match the reference document's wording (`Homeowner(s)`, `Property Address`).
  - **Bullets** — use `-` dash markers to match the reference; `•` reserved for nested or stylistic use later.
  - **Signature block** — rewritten to match the reference: numbered `7. Signatures` heading, then inline `Label: ____ Date: ____` rows for Homeowner / Co-Homeowner / Contractor / Roof AID Rep with `Printed Name:` lines underneath. Replaces the previous stacked single-line layout.

## Out of scope this turn
- The **real PDF renderer** (Supabase Edge Function at [supabase/functions/_shared/template-pdf.ts](supabase/functions/_shared/template-pdf.ts)) was intentionally not touched. Once the owner confirms the preview looks right, the same styling decisions (watermark text, heading scale, signature layout) will be ported to the pdf-lib renderer so the generated PDF matches.
- Branding (logo image) — owner confirmed text-only watermark, so no asset work needed.

## Notes for the next iteration
- The HTML preview is a single-page surface; the real PDF paginates. Page-number indicator and per-page watermark tiling will look different in PDF — track in the PDF port.
- If the editor footer feels cramped, the sticky footer can absorb a "view changes" / "discard draft" affordance later without restructuring.
