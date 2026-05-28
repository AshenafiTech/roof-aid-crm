# 3rd Party Authorization — default content aligned to reference document

## Purpose
The owner provided a reference scan of the actual signed Third-Party Authorization document and asked that the template body match it. The defaults were already ~99% aligned; this pass closes the gap in the UPPA Compliance section so the built-in copy matches the reference word-for-word (with `{{contractor_name}}` tokens preserved for multi-tenant naming).

## Changes
Both copies of the default content were updated together so the web preview and the Edge Function PDF renderer stay in sync.

### [apps/web/lib/templates/defaults.ts](apps/web/lib/templates/defaults.ts) — section `3pa-uppa`
- Removed the `Flat fee of $4,000, or` sub-bullet (not in the reference).
- Fixed `25% of total approved insurance claim (RCV + Supplements).` → `… (ACV, RCV + Supplements).` (reference lists both).
- Converted `Compensation Amount: The greater of:` from a paragraph to a top-level bullet (matches the `•` marker on page 3 of the reference).
- Converted `Payment is due immediately upon termination…` from a paragraph to a top-level bullet (also bulleted in the reference).

### [supabase/functions/_shared/template-defaults.ts](supabase/functions/_shared/template-defaults.ts)
Mirror change to the Deno-side defaults so generated PDFs render the same content when no custom version is active.

## Effect on tenants
- **No active custom version** → next document generation picks up the new defaults automatically (web preview and Edge Function both read from the updated source).
- **Custom version published** (e.g. the owner's `Custom v9`) → the active version still wins. To pick up these changes, either:
  1. Open the editor, copy the corrected UPPA block, and Save + publish (creates `v10`).
  2. Or click "Revert to default" in the editor footer, then publish a new version off the updated defaults.

## Not changed
- All other sections (`3pa-purpose`, `3pa-comm`, `3pa-scope`, `3pa-cancel`, `3pa-funds`) were already identical to the reference and were left alone.
- `{{contractor_name}}` tokens stay in place — they resolve to "Roof AID" for the reference tenant but the template remains usable for any tenant.
