# Document generation — field sourcing rules

## Purpose
Owner specified exactly which header / signature fields should be auto-filled vs. left blank when a document is generated for a prospect. This pass implements that split and removes the now-useless inputs from the New Document dialog.

## Rules implemented
| Field | Source | Behavior |
| --- | --- | --- |
| Claim number | (none) | Always blank — handwritten or filled by mobile after inspection |
| Date | (none) | Always blank — handwritten or filled by mobile when signed |
| Date of loss | (none, deferred) | Always blank — no prospect column today; revisit when intake captures it |
| Homeowner(s) | `prospects.name` | Filled at generation |
| Property Address | `prospects.address/city/state/zip` | Filled at generation |
| Contractor | `tenants.name` (the **company name** set at signup) | Filled at generation; renames propagate automatically since each generation re-reads the row |
| Body `{{contractor_name}}` tokens | same as above | Substituted at generation |
| Homeowner Signature | (none) | Blank; mobile collects the signature via `embed-signature` |
| Contractor Acceptance / Rep Signature | `tenants.company_signature_path` + `company_signature_signer` | Already auto-stamped by the existing `maybeAutoCompanySign` flow ([documents/actions.ts](apps/web/app/(dashboard)/documents/actions.ts)) |

## Files changed

### Edge function — generated PDF
- [supabase/functions/generate-pdf/index.ts](supabase/functions/generate-pdf/index.ts) — token map and `renderTemplateHeader` call both pass `claim_number: ''`, `loss_date: ''`, `today: ''`. Inline comment explains the rationale.
- [supabase/functions/_shared/template-pdf.ts](supabase/functions/_shared/template-pdf.ts) — `renderTemplateHeader` now falls back to a dashed fillable line for every empty header field (claim, loss, date, homeowner, address, contractor), giving the same visual treatment everywhere.

### Web preview
- [apps/web/components/admin/template-preview.tsx](apps/web/components/admin/template-preview.tsx) — new optional `tenantName` prop. When set, the **Contractor** header row renders the actual company name (not a fillable line), and inline `{{contractor_name}}` tokens render the company name as plain text (not the placeholder chip). Implemented via a new `ResolvedTokensContext` so the inline renderer can decide chip-vs-text per token.
- [apps/web/components/admin/template-editor.tsx](apps/web/components/admin/template-editor.tsx) — accepts `tenantName` and forwards it to the Preview tab.
- [apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx](apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx) — server-side fetches `tenants.name` (via `getCurrentTenantName`) and passes to both the editor and the standalone preview. Since this runs on every render, **changing the company name in the future propagates to the preview immediately** (and to every newly generated PDF).

### New Document dialog
- [apps/web/components/shared/new-document-dialog.tsx](apps/web/components/shared/new-document-dialog.tsx) — for `3rd_party_auth`, the three input fields (Insurance carrier, Claim #, Date of loss) are replaced with a single explainer panel: "No fields to enter. Homeowner, property address, and contractor are pulled from the prospect and your company profile. Claim number, date, and date of loss stay blank so they can be filled in on-site or by mobile after inspection." Telefonista just clicks Continue.

## Propagation of company-name edits
- `generate-pdf` reads `tenants.name` on every invocation, so future PDFs reflect the latest name immediately.
- The template detail page reads `tenants.name` on every server render, so the preview reflects edits too.
- Already-generated PDFs are immutable in storage — those keep the name they had at generation time.
- A UI to actually edit the company name post-signup is **not yet exposed** in `/admin/settings`; that's a separate small feature (one input + a server action calling `update tenants set name = …`). Flagged for a follow-up.

## Deferred
- `prospects.loss_date` column + UI to capture the storm date. Skipped per owner direction ("let's leave date of loss empty for now").
- ACV / RCV / Supplement dialogs still ask for their existing fields (insurance carrier, deductible, total job cost, scope) — out of scope this pass.
