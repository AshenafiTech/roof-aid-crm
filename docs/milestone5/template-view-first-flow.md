# Template detail page — view-first flow

## Purpose
Picking a document type from the templates list used to drop the user straight into the editor with no context. The detail page now opens in **view mode** so the user sees what's currently active before deciding to make changes. If no custom version exists, they get a clear "Create template" CTA instead of an empty editor.

## Behavior
- `/admin/settings/document-templates/[kind]` (view mode, default)
  - **Has custom version**: renders a page-styled preview of the active version with an "Edit template" primary button in the header. Version history link stays available.
  - **No custom version**: renders an empty-state card explaining the user is on the built-in default, with a "Create template" primary button.
- `/admin/settings/document-templates/[kind]?edit=1` (edit mode)
  - Renders the existing `TemplateEditor`. A "Cancel" link in the header returns to view mode.

The `?edit=1` query param drives the switch so back/forward and refresh behave naturally and the page stays a server component.

## Files
- [apps/web/components/admin/template-preview.tsx](apps/web/components/admin/template-preview.tsx) — new. Extracts the page-styled preview into two exports:
  - `TemplatePreviewSurface` — standalone, used by the detail page.
  - `TemplatePreviewDialog` — same surface wrapped in a modal, used by the editor's in-progress "Preview" button.
  - Replaces the old `template-preview-dialog.tsx` (deleted).
- [apps/web/components/admin/template-editor.tsx](apps/web/components/admin/template-editor.tsx) — updated import; publish redirect now goes to the kind's view page (`/admin/settings/document-templates/[kind]`) instead of the list, so the user immediately sees what they just published.
- [apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx](apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx) — rewritten:
  - Reads `searchParams.edit`.
  - View mode renders `TemplatePreviewSurface` or `NoTemplateState`.
  - Edit mode renders the `TemplateEditor` unchanged.
  - Header action slot adapts: "Edit template" in view-with-custom, "Cancel" in edit mode, "Create template" lives inside the empty state card.

## Why a query param and not a sub-route
A `?edit=1` flag keeps the page a single server component sharing one data load (`loadTemplateForEdit`). A `/edit` sub-route would have required either a second loader or pulling state up — overkill for one toggle.

## Notes
- "Create template" navigates to `?edit=1`; the editor still seeds from the built-in default via `loadTemplateForEdit`, so the user starts from required boilerplate.
- The preview here is still HTML, not a real PDF. Same caveat as the editor's in-progress preview — see [template-editor-preview.md](template-editor-preview.md).
