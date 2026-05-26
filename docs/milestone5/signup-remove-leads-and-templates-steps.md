# Signup Wizard — Remove "Get Your Leads" and "Your Templates" Steps

## Purpose

Trim the signup wizard from six steps down to four by removing the two
non-essential preview steps:

- **Step 4 — Get Your Leads** (upload-or-buy CTA)
- **Step 5 — Your Templates** (read-only preview of outreach sequences)

Both were informational only — they didn't capture data or block setup —
so dropping them shortens onboarding without losing any state.

## Final step list

1. Create Account — Plan + basic info
2. Agreements — Data, supplement terms, T&C
3. Company Profile — Business info
4. You're Ready — Access your dashboard (was Step 6)

## Changes

All edits are in
`apps/web/app/(auth)/signup/signup-wizard.tsx`.

- `STEPS` constant trimmed to four entries; the success step is now `n: 4`.
- Removed the `openTemplate` / `setOpenTemplate` state — it was used
  exclusively by the deleted Step 5 accordion.
- Removed the `step === 4` (leads) and `step === 5` (templates) render
  blocks from the wizard switch.
- Renamed the success-screen component from `Step6` → `Step4` and
  wired it under `step === 4`. Existing `gotoStep(4)` calls from
  Step 3 (`submitProfile` and `onSkip`) now flow directly to the
  success screen with no further code changes.
- Removed the "Outreach templates loaded" success check from the
  completion screen (the templates step no longer runs).
- Updated the in-screen labels from "Step X of 6" to "Step X of 4"
  for steps 1–3.

## Notes

- `Step3` still offers a "Skip" button. It used to skip the leads step
  and is now effectively a "Skip company profile" button that jumps
  straight to "You're Ready". If we want to remove that skip path in
  a follow-up, it lives at `signup-wizard.tsx` in the Step 3 render
  block's `onSkip` prop.
- No backing CSS was removed. The lead-card / template-list classes
  still exist in `signup.css` in case the steps are reintroduced
  later, but they are unreferenced.
