# Template editor — redirect to list after publish

## Purpose
After "Save + publish" in the document template editor, the user was left on the same page with only a toast — unclear what to do next. They now land back on the templates list, which closes the editing loop and lets them pick another template (or stop).

## Change
- [apps/web/components/admin/template-editor.tsx](apps/web/components/admin/template-editor.tsx) — restructured `publish()`:
  - Save + publish run in a single transaction with one combined success toast: `Published <Template Title> v<n>` (was two toasts: "Saved as draft vN" then "Template published").
  - On success, `router.push("/admin/settings/document-templates")` instead of `router.refresh()`. The list page's "Custom vN" badge will reflect the new version.
  - `saveDraft()` simplified — the old `onSuccess` callback was only used by `publish()`, which is now self-contained.
- "Save draft" alone keeps its current behavior (stays on the page, toasts, refreshes).

## Why a redirect over an in-page panel
The user came from the templates list and the published version is now visible there. Returning matches the mental model of "I came here to edit one thing, I'm done." If the user wants version detail, the "Version history" link in the page header is still available before they publish.

## Failure handling
If the save step succeeds but the publish step fails, the user stays on the editor with their content intact and sees the publish error. The draft is saved server-side (visible in version history); we deliberately do not toast about the intermediate save to avoid a misleading double-toast.

## Next iteration candidates (per user)
- "Preview with sample data" button in the editor (template-level preview doesn't exist today — rendered PDFs are per-prospect at `/documents/[id]`).
- Highlight the just-published row on the destination list page.
