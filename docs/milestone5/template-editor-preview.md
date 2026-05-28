# Template editor — live preview

## Purpose
Owners editing a document template couldn't see what the result would look like until they published the template and generated a real prospect document. A "Preview" button in the editor now renders the in-memory draft (no save required) into a page-like dialog with sample data filled in, so authors can sanity-check section numbering, merge-field substitution, and overall shape before committing.

## Why HTML instead of PDF
The real PDF renderer is a Supabase Edge Function ([generate-pdf/index.ts](supabase/functions/generate-pdf/index.ts)) that requires a `prospect_id` and writes a `documents` row + storage object — destructive and unsuitable for ephemeral preview. Calling it would also require a server roundtrip per preview. An HTML render in the browser matches the structure (fixed header → numbered sections → signature footer) and uses the same token substitution helper ([substituteTokens](apps/web/lib/templates/blocks.ts#L258)), giving instant feedback. It is not pixel-perfect against the PDF, which is acceptable for a copy-authoring preview.

## Files
- [apps/web/components/admin/template-preview-dialog.tsx](apps/web/components/admin/template-preview-dialog.tsx) — new. Renders a `Section[]` into a page-styled dialog: title, metadata header with sample claim/loss/homeowner/address, numbered sections, and signature lines. Walks the `Block[]` shape (paragraph, heading, bullet, ordered, table, image, spacer) and inline marks (bold/italic/underline) into JSX. Embeds hard line breaks from spans.
- [apps/web/components/admin/template-editor.tsx](apps/web/components/admin/template-editor.tsx) — adds a "Preview" button in the action row (between "Revert to default" and "Save draft") and mounts the dialog with the current in-memory `sections`. State is local — opening the preview never saves.

## Placeholders, not sample values
Initial iteration filled merge fields with sample values ("Jane Sample", etc.), which made the preview look like a finished document and was misleading. Per author feedback, the preview now treats merge fields the way the template treats them — empty, awaiting prospect data:
- Header metadata (Claim number, Date of loss, Date, Homeowner, Property address, Contractor) is rendered as label-only rows with a dashed fillable line.
- Inline `{{token}}` markers in section bodies and titles are rendered as compact dashed chips showing the token's human label (e.g. `Homeowner name`, `Claim number`). Resolved via `tokensFor(kind)` and shared with the renderer through a small React context.
- Real values are still injected by the Edge Function at document-generation time — nothing about the rendering pipeline changes.

## Notes
- Section titles are also token-substituted (mirroring how a section like "{{contractor_name}} Acknowledgement" would render).
- Empty templates show a friendly "No sections yet" message inside the page frame so the header/footer are still visible.
- The button is available regardless of whether the user has unsaved changes — preview always reflects the current editor state.
