# Signup Wizard — Per-Field Validation Errors (with Toasts for Server Errors)

## Purpose

The signup wizard ([apps/web/app/(auth)/signup/signup-wizard.tsx](../../apps/web/app/(auth)/signup/signup-wizard.tsx)) previously rendered a single inline error block at the top of each step ("All fields are required.", "All three agreements must be accepted.", etc.) using `.form-err`. That message told the user *something* was wrong but not *which field*, leading to confusion when the form was long.

This change replaces that pattern with:

- **Per-field inline error highlights** on Step 1 and Step 2 — every missing/invalid input gets a red border (`.form-input.error`) plus a small helper message below (`.field-err`), matching the existing convention used on the login form.
- **Auto-scroll and focus on the first errored field** when Continue is clicked, so the user doesn't have to hunt for what they missed when fields are below the fold.
- **Sonner toasts only for server-side errors** returned by the `createAccount` and `saveCompanyProfile` server actions, since those errors don't map to a single form field.

## Behaviour

### Step 1 — Account / Plan
On clicking **Continue →**, each empty or invalid field is flagged individually:

- `firstName`, `lastName`, `companyName`, `phone` → "Required"
- `email` → "Required" / "Enter a valid email address"
- `state` → "Select your state"
- `password` → "Required" / "Must be at least 8 characters"
- `plan` → "Select a plan to continue" (shown below the plan grid)

As soon as the user edits a flagged field, that field's error clears immediately. Other fields' errors stay until they're fixed or the next Continue click re-runs validation.

### Step 2 — Agreements
The **I Agree — Create Account →** button is no longer disabled when boxes are unchecked. Clicking it surfaces a per-checkbox error ("You must accept this agreement") under whichever boxes are still unchecked, so the user can see exactly which agreement is missing rather than wondering why the button doesn't respond.

If `createAccount` succeeds but returns `{ ok: false, error }` (e.g. duplicate email from Supabase), the server message is surfaced via `toast.error(result.error)`.

### Step 3 — Company Profile
All fields are optional client-side, so validation runs server-side only. Errors from `saveCompanyProfile` still surface via toast.

## Implementation Notes

- Added a typed `FieldErrors = Partial<Record<keyof FormState, string>>` map and two state slots (`step1Errors`, `step2Errors`) on `SignupWizard`.
- `update()` now also clears the corresponding entry in both error maps when the user edits a field, so errors disappear as the user fixes them.
- `validateStep1` and `validateStep2` build the full error map in one pass and `setStep<N>Errors(errs)` before returning a boolean. This means *all* problems are highlighted at once on Continue, not one-at-a-time.
- Each form input has a stable `id="signup-<fieldKey>"` (e.g. `signup-firstName`, `signup-agreeData`). A small helper, `focusFirstError(errs, order)`, finds the first errored key in document order, then calls `scrollIntoView({ behavior: "smooth", block: "center" })` and `.focus({ preventScroll: true })` on the matching DOM node. `preventScroll: true` keeps the smooth scroll from being interrupted by the implicit focus jump. The plan grid uses `id="signup-plan"` on its wrapper `<div>`; focus is a no-op on a non-focusable element, but scroll still works.
- The `.form-input.error` and `.field-err` rules already existed in [signup.css](../../apps/web/app/(auth)/signup/signup.css) (lines 103, 108) and were unchanged. No new CSS was needed.
- Sonner `<Toaster richColors position="top-right" />` is mounted globally in [apps/web/app/layout.tsx:47](../../apps/web/app/layout.tsx#L47), so toasts work without per-route wiring.

## Decisions

- **Why not disable Continue?** Disabled buttons hide *why* the button is off. Users sometimes don't realise an agreement is missing or which input is empty. Letting the click proceed and surfacing per-field errors makes the cause explicit.
- **Why keep toasts for server errors?** Server errors (e.g. "email already exists") are global to the submit, not tied to a specific field. A toast surfaces them prominently without forcing the user to scroll back to a banner.
- **No new dependency.** This intentionally avoids introducing `react-hook-form` to the signup wizard (which would be a larger refactor across all three steps); the existing controlled-input pattern already does the job.
