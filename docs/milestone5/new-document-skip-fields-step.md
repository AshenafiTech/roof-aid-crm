# New Document dialog — skip the "fields" step entirely

## Purpose
The "Fill in the details" step (Insurance carrier / Claim # / Date of loss for 3PA; Insurance / Claim # / Deductible / Total job cost / Scope for ACV/RCV) was friction the owner doesn't want. Header fields are now sourced from the prospect + tenant records (or stay blank for mobile to fill), and anything in the body can be tweaked inline in the preview before generation.

## Behavior
- **Before**: Template → **Fields** → Preview → Generate.
- **After**: Template → Preview → Generate.

Picking a template loads the preview directly in one transition. Inside the preview, the existing "Edit content" toggle still lets the telefonista tweak per-document copy before generating.

## Files
- [apps/web/components/shared/new-document-dialog.tsx](apps/web/components/shared/new-document-dialog.tsx)
  - Dropped `"fields"` from the `Step` union and its entire JSX block.
  - Removed field state (`insurance`, `claim`, `lossDate`, `deductible`, `totalJobCost`, `scope`) and the `buildFields()` helper.
  - `pickTemplate(k)` now calls `loadTemplateForPreview({ … templateKind: k, fields: {} })` inside the same transition and advances `step` to `"preview"`. Passes `k` directly so it doesn't depend on the freshly-set `kind` state (which would be stale in the same render cycle).
  - `generate()` now sends `fields: {}` since there's nothing to collect at this layer.
  - Preview-step "Back" button goes to `"template"` instead of `"fields"`.
  - Removed `goPreview` (folded into `pickTemplate`).
  - Removed unused imports (`Input`, `Label`, `Textarea`) and the now-orphaned `FieldGroup` helper.

## Implications
- For ACV / RCV, body tokens like `{{insurance_company}}`, `{{deductible}}`, `{{total_job_cost}}`, `{{scope_of_work}}` will render as `[token]` placeholders unless filled at signup or edited in the preview. Owner can revisit this once the source for those values is decided (likely additional `prospects` columns or a dedicated claim-details page) — flagged for follow-up, not blocking the 3PA flow this is primarily about.
- The 3PA template doesn't reference any of those tokens, so it generates cleanly with the empty-fields payload.
