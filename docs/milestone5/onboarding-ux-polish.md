# Onboarding UX Polish — Buy-a-Number Flow

## Purpose

The atomic buy + attach flow is functionally correct, but three moments
were emotionally rough for the customer:

1. **The 5–15 second wait** during purchase, where a bare spinner gave
   no indication of progress or how long to wait. Real customers were
   likely to assume it was stuck and reload the tab.
2. **The silent success** — the picker page just refreshes to a "set up"
   card, with no toast that the customer can connect to "I can now use
   this."
3. **The failure toast** used engineer phrasing ("rolled back",
   "attachment failed") and exposed underlying error text that was
   meaningless to a non-technical customer, while *also* sounding
   alarming.

This change tightens all three.

## What changed

### 1 · Phased loading copy

**[components/shared/number-picker-form.tsx](../../apps/web/components/shared/number-picker-form.tsx)**

- Added a `purchaseElapsedMs` clock that ticks every 500ms while the
  purchase transition is in flight (cleaned up automatically on
  success/failure).
- Helper `purchasePhaseMessage(ms)` picks one of three reassuring
  phrases:
  - 0–5s → "Reserving your number…"
  - 5–15s → "Setting up your line…"
  - 15s+ → "Almost ready…"
- The button label rotates through these (replacing the static
  "Buy & continue" while purchasing). A subtext below the button reads
  "This can take up to 30 seconds — please keep this tab open."

Net effect: instead of an opaque spinner the customer sees something
move every few seconds and knows the system is working. The "keep this
tab open" subtext defends against the second-most-common cause of
support tickets — closing the tab mid-purchase.

### 2 · Welcome toast with description

**[components/shared/number-picker-form.tsx](../../apps/web/components/shared/number-picker-form.tsx)** + **[app/onboarding/number-picker.tsx](../../apps/web/app/onboarding/number-picker.tsx)**

- New optional prop `successDescription?: (e164: string) => string` on
  `NumberPickerForm`. When provided, passed to Sonner as the
  `description` field of `toast.success(...)`.
- The onboarding picker now provides both:
  - Title: `"Your business line is ready — (704) 471-4756"`
  - Description: `"You can now make calls and send texts from your dashboard. Try reaching out to a lead."`
- The settings page's `NumberPickerForm` was not given a description, so
  its existing brief toast is unchanged.

Net effect: customers immediately understand what just unlocked and
what to do next, instead of inferring it from a missing banner.

### 3 · Friendlier failure copy

**[app/onboarding/actions.ts](../../apps/web/app/onboarding/actions.ts)**

- The rollback path now returns a single, calm sentence:
  > "We couldn't finish setting up that number. No charge was made — please try again or pick a different number."
- The underlying technical error (`errorMessage(err)`) is no longer
  appended to the customer-visible string. It still appears in the
  structured `[onboarding:purchase]` logs at the `rollback-started` and
  `rollback-orphan-critical` phases, where ops can see exactly what
  failed without exposing it to the customer.

Net effect: even when something goes wrong the customer reads "No charge
was made" — which is the only thing they actually want to know — and
gets a clear next step ("try again or pick a different number") instead
of being asked to interpret engineer-speak.

## What was deliberately NOT changed

- The settings-page `NumberPickerForm` keeps its plain toast and the
  default button text (`Buy number`). The onboarding-specific
  `successDescription` prop is opt-in.
- The phased loading copy applies to *any* consumer of
  `NumberPickerForm` automatically — both onboarding and the settings
  page benefit, since both wait on the same Telnyx round-trip.
- Atomicity, structured logging, and the trace-id system from the
  earlier atomic-purchase-and-attach change are untouched.

## Verification

- Typecheck: `pnpm --filter @roof-aid/web exec tsc --noEmit` → clean.
- Manual: click **Set it up** → search area code → buy.
  - Watch the button copy cycle through phases.
  - On success, observe both title and description in the toast.
  - To exercise the failure path, simulate a Telnyx outage (mock
    `purchaseNumber` to throw) and confirm the toast reads the new
    calmer copy.
