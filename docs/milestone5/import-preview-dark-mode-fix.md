# Import Prospects preview — dark-mode readability fix

## Symptom
On the upload-file preview at `/new-leads/import`, skipped rows in the preview table became unreadable in dark mode — the entire row content (name, address, phone, email) was rendered in `text-muted-foreground` and sat on a `bg-amber-500/5` tint, which is so faint at 5% opacity that the dimmed text effectively disappeared. There was no way to skim what was being skipped or why.

## Fix
[apps/web/app/(dashboard)/new-leads/import/import-prospects.tsx](apps/web/app/(dashboard)/new-leads/import/import-prospects.tsx)

- **Skipped row class** — removed the global `text-muted-foreground` on the `<tr>` so cell content stays at normal text contrast. Bumped the dark-mode bg from `dark:bg-amber-500/5` to `dark:bg-amber-500/10` and added a `border-l-2 border-l-amber-500/70` left accent so skipped rows are clearly distinguishable without dimming their content.
- **Ready row** — added `hover:bg-muted/30` for a subtle pointer feedback.
- **Status badges** — both `Ready` and the skip-reason now render as compact pill badges with a `ring-1` border and a light tinted background (`bg-emerald-500/15` / `bg-amber-500/15`). Same component shape light/dark; the foreground text uses the existing 700 (light) / 300 (dark) pair so contrast meets accessibility on both themes.

## Result
- Skipped row content (name, address, phone) is readable.
- The reason chip stands out without yelling.
- Visual hierarchy at a glance: clean rows for ready, amber-tinted with left accent + reason chip for skipped.

## Not changed
- Column Mapping chips, stats cards, and the file-info row — they already use existing tokens (`bg-muted/30`, `dark:text-*-400`) that hold up in dark mode.
- The upload step itself (`<Card>` with dropzone-style content) was not flagged and looks fine in both themes.
