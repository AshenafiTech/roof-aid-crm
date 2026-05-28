# Template detail page — show default preview to new users

## Purpose
A new tenant (no custom version published yet) used to land on a small "No custom template yet" empty card with a "Create template" button — hiding what the document actually looks like until they clicked through into the editor. Per owner direction, new users should immediately see the built-in default rendered, so they can decide whether to customize at all.

## Behavior
- **No custom version (new tenant)**: the page now renders the **built-in default** preview directly. A small note above the preview says "Showing the built-in default — used when generating documents until you publish a custom version." The header CTA is **"Customize this template"** (with a `Sparkles` icon).
- **Has custom version**: unchanged — renders `Custom vN` preview with the **"Edit template"** CTA.
- **Edit mode (`?edit=1`)**: unchanged — renders the editor with a Cancel link.

## Files
- [apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx](apps/web/app/(dashboard)/admin/settings/document-templates/[kind]/page.tsx) — removed the `NoTemplateState` empty card; the same `TemplatePreviewSurface` is reused for both `hasCustom` and default cases. The primary action label/icon switch based on whether a custom version exists ("Edit template" vs. "Customize this template").

## Notes
- `loadTemplateForEdit` already returns the built-in defaults in `state.content` when no active version is set, so no additional data load was needed.
- The page is still a server component — only the action label is conditional. No client-state was added.
- For new tenants, the "Customize this template" path still lands in the editor seeded with the same defaults (via the existing editor seeding logic), so nothing breaks the "fresh start" flow.
