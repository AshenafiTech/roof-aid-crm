# Document Templates — Owner Customization + Telefonista Edits + Audit Log

## Purpose

Tenant owners can now customize the legal copy used when generating prospect
documents (3rd Party Auth, ACV, RCV, Supplement). Telefonistas can adjust the
prospect's document at generation time when something needs to change for that
specific case — **without altering the owner's template**. Every telefonista
edit is captured so the owner can review it.

Before this change the four template kinds were rendered from hardcoded
prose inside the `generate-pdf` Edge Function.

## What changed

### 1. Schema (migration `035_m6_document_templates.sql`)

Three new tables:

- `document_templates` — one row per `(tenant_id, kind)` with an
  `active_version_id` pointer.
- `document_template_versions` — immutable, append-only content rows. The
  content is a structured block-JSON document (paragraph / heading / bullet /
  spacer with bold / italic / underline marks). Variables appear as
  `{{token}}` placeholders in span text.
- `document_edits` — append-only diff per generated document
  (`field_changes`, `body_changes`, `final_content`, `template_version_id`,
  `edited_by`). This is where telefonista edits live; templates are never
  mutated.

RLS:

- `document_templates` / `document_template_versions`:
  - SELECT: any tenant member (telefonista needs the active version at
    preview time).
  - INSERT / UPDATE / DELETE: `owner` / `admin` only.
- `document_edits`:
  - SELECT: any tenant member.
  - INSERT: `owner` / `admin` / `telefonista`.
  - No UPDATE / DELETE — append-only.

The migration also seeds an empty `document_templates` row per existing
tenant for all four kinds.

### 2. Owner authoring UI

New routes:

- `/admin/settings/document-templates` — list of four kinds with a status
  pill ("Custom v3" or "Using default").
- `/admin/settings/document-templates/[kind]` — editor.
- `/admin/settings/document-templates/[kind]/history` — version list.

The editor is a markdown-ish textarea with a toolbar for headings, bold /
italic, bullets, **Insert variable** (drops a `{{token}}` at the cursor),
and **Import .docx** (parses via `mammoth` server-side into markdown).
Owners save drafts or "Save + publish" which both creates a new immutable
version and flips `active_version_id`. Reverting to default just clears
`active_version_id`.

Token catalog lives in `apps/web/lib/templates/tokens.ts`.

### 3. Edge Function (`supabase/functions/generate-pdf/index.ts`)

Three render paths:

1. If the request carries `final_content` + `template_version_id`,
   render from `final_content` (telefonista-edited).
2. Else if `(tenant, kind)` has an `active_version_id`, render from that
   version's content with server-side token substitution.
3. Else, fall back to the existing hardcoded body (zero regression for
   tenants that haven't customized).

Block rendering lives in `supabase/functions/_shared/template-pdf.ts` —
walks the block JSON and emits to pdf-lib with page-break awareness.

The signature block + footers are appended after body rendering as before.

### 4. Telefonista flow

`NewDocumentDialog` (`apps/web/components/shared/new-document-dialog.tsx`)
gains a new `preview` step that appears **only** when the tenant has
published a custom template:

1. `template` — pick the kind.
2. `fields` — fill the variables (insurance carrier, claim #, …).
3. `preview` — see the template with tokens already substituted; toggle
   edits inline. A banner reminds the user "edits only affect this
   document — the template stays unchanged."
4. `done` — link to the signing screen.

Server action `loadTemplateForPreview` returns the substituted markdown +
the resolved field values to use as a diff baseline.

`createDocument` accepts `templateVersionId`, `finalContent`,
`baselineContent`, `fieldOverrides`, `fieldBaseline` and writes a
`document_edits` row after the Edge Function returns.

If no custom template exists for that kind, the flow skips the preview
step and behaves exactly as before.

### 5. Audit log surfaces

- **Per-document** — `DocumentAuditSection`
  (`apps/web/components/documents/document-audit-section.tsx`) is mounted
  on `/documents/[id]`. Shows who edited, against which template version,
  with before / after for each field and body change.
- **Template history** — `/admin/settings/document-templates/[kind]/history`
  lists all versions (drafts + published), creator, source (editor or
  DOCX), and change summary.

## Files

### Created

- `supabase/migrations/035_m6_document_templates.sql`
- `supabase/functions/_shared/template-pdf.ts`
- `apps/web/lib/templates/template-kinds.ts`
- `apps/web/lib/templates/tokens.ts`
- `apps/web/lib/templates/blocks.ts`
- `apps/web/lib/templates/diff.ts`
- `apps/web/lib/types/mammoth.d.ts`
- `apps/web/app/(dashboard)/admin/settings/document-templates/page.tsx`
- `apps/web/app/(dashboard)/admin/settings/document-templates/actions.ts`
- `apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx`
- `apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/history/page.tsx`
- `apps/web/components/admin/template-editor.tsx`
- `apps/web/components/documents/document-audit-section.tsx`

### Modified

- `supabase/functions/generate-pdf/index.ts` — accepts the new request
  fields, renders custom template when present, falls back to hardcoded
  body otherwise.
- `apps/web/app/(dashboard)/admin/settings/page.tsx` — new "Document
  templates" card.
- `apps/web/app/(dashboard)/documents/actions.ts` — `createDocument`
  accepts the telefonista edit payload, writes `document_edits`;
  `loadTemplateForPreview` server action added.
- `apps/web/components/shared/new-document-dialog.tsx` — new preview /
  edit step driven by `loadTemplateForPreview`.
- `apps/web/app/(dashboard)/documents/[id]/page.tsx` — mounts the audit
  section.
- `apps/web/lib/supabase/database.types.ts` — type defs for the three
  new tables.
- `apps/web/package.json` — adds `mammoth` for DOCX import.

## Why this design

- **Block JSON, not HTML or DOCX**, because the Deno PDF renderer walks a
  typed AST without needing an HTML parser. Block shape is a deliberate
  subset of ProseMirror so we can swap in TipTap later without migrating
  data.
- **Immutable versions** give us a stable diff target. Every telefonista
  edit references the exact version they saw, so the audit row stays
  meaningful even after the owner publishes a new version.
- **`document_edits` is its own table** rather than living inside
  `activities` because we need before / after pairs and a FK to the
  template version, neither of which sits comfortably in the flat
  `activities` metadata jsonb.

## Verification

1. Run `supabase db reset` (or apply migration 035). Confirm four
   `document_templates` rows exist per tenant; generating a 3rd-party-auth
   document still produces the UPPA-compliant PDF (sha256 stable across
   the migration).
2. As owner: `/admin/settings → Document templates → ACV Contract`. Type
   a body with `{{insurance_company}}` via the toolbar. Save + publish.
   Refresh; the list shows "Custom v1". Import a `.docx` and publish v2.
3. As telefonista: open a prospect, **New document → ACV Contract**.
   Verify a `preview` step appears with the owner's body, tokens already
   substituted from the form. Adjust one paragraph. Generate. Open the
   PDF — body matches your edit; the template you'd see in settings is
   unchanged.
4. On `/documents/[id]` the **Edit log** card shows the body change.
5. RLS: as a tenant-B user, attempt `select * from
   document_template_versions where tenant_id = '<tenant-A>'` — must
   return zero rows. As telefonista, attempt
   `insert into document_template_versions ...` — must fail.

## Editor capability upgrades

After the first import test against a real UPPA agreement DOCX, several
gaps in the authoring pipeline were patched:

- **Mammoth output normalizer** (`normalizeMammothMarkdown` in
  `apps/web/lib/templates/blocks.ts`) — strips mammoth's over-escaping
  (`\.`, `\(`, `\-`, `\+`, etc.) and converts its `__bold__` output to
  `**bold**` so the editor display matches what owners expect.
- **Nested bullets** — `bullet` blocks now carry a `level` (1–3); the
  parser detects tab- or 2-space indent; the PDF renderer indents each
  level by 18 px and uses different bullet glyphs (`• ◦ ▪`).
- **Hard line breaks inside paragraphs** — markdown trailing `  ` (two
  spaces + newline) is preserved as `\n` inside a span; the PDF renderer
  emits a forced line break rather than starting a new paragraph. This
  is what makes the "Date: ___ Homeowner: ___ Address: ___" stacked
  field blocks render correctly.
- **Live preview** — the editor now has Edit / Preview / Side-by-side
  tabs (`apps/web/components/admin/template-preview.tsx`) that render
  the same blocks the PDF renderer will draw, with token placeholders
  surfaced as `[Token label]`. The telefonista's NewDocumentDialog
  preview step gets the same Edit/Preview tabs.

## Install step

`mammoth` is a new dependency for DOCX import. Run `pnpm install` in
`apps/web` once before booting the dev server.
