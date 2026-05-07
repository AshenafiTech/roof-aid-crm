# 10DLC — what it is and how Roof-Aid handles it

A short explainer for the product owner. No telecom jargon.

## The one-paragraph version

To text US homeowners reliably, the US carriers (T-Mobile, AT&T, Verizon) require every business to register its phone number and its messaging "use case" with a regulator-like database. This is called **10DLC registration.** Without it, US carriers silently block most of our messages so they never reach the homeowner. Roof-Aid handles this registration automatically as part of the tenant signup wizard — the roofing company fills in their business info once, our software submits the registration to Telnyx and the carriers, and within 1-3 business days their number is fully active. **No support tickets, no manual setup, no per-tenant work for us.**

---

## Why this matters (the business problem)

Imagine signing a new tenant — say "Bentonville Roofers". They pay you $99/mo, sign their first homeowner lead, click **Send SMS**…

…and the message is silently dropped by T-Mobile.

The homeowner never sees it. Bentonville Roofers thinks the CRM is broken. They cancel.

This isn't theoretical — it's what happens to anyone who tries to send US business SMS without going through 10DLC registration. T-Mobile in particular blocks **~95%** of unregistered business SMS to its subscribers.

10DLC isn't a "nice to have". It's the price of admission for sending business SMS to US phones at all.

## What 10DLC actually is

It's two pieces of paperwork the US carriers require:

1. **Brand registration** — *Who are you as a business?* Legal name, EIN (tax ID), address, website, contact phone. Costs ~$4 (sole prop) or ~$40 (full LLC) one-time per tenant.
2. **Campaign registration** — *What are you using SMS for?* Use case ("Customer Care"), 3 sample messages you'll actually send, opt-in language. Costs ~$2/mo (sole prop) or ~$10/mo (full LLC) per tenant.

Tenants get whatever throughput tier matches their registration — usually 75 messages/min for sole prop, up to 4,500/min for standard. Both are way more than a roofing company will ever send.

## How Roof-Aid handles it (the customer-facing story)

When a roofing company signs up, the onboarding wizard has three steps. Step 1 is where 10DLC gets collected naturally:

```
Step 1 — Tell us about your business
  ─ Company name + entity type
  ─ EIN (or SSN if sole proprietor)
  ─ Address
  ─ Mobile phone (we'll text a code)
  ─ Website
  ─ What you'll use SMS for (3 dropdown choices)
  ─ Three sample messages you'll send

Step 2 — Pick a phone number          (existing flow)

Step 3 — Calling preferences          (existing flow)
```

The tenant fills it out **once**. Behind the scenes our code:

1. Sends their info to Telnyx → Brand registered with the carriers
2. Sends their use case + samples → Campaign registered
3. Buys their phone number (existing flow)
4. Attaches the number to the campaign

Tenant goes about their day. **1 to 3 business days later** Telnyx tells us the registration is approved, and we update the tenant's dashboard to "Active". Their SMS suddenly works on T-Mobile and AT&T without any further action.

In the meantime — during the 1-3 day wait — they can:
- ✅ Make and receive voice calls (10DLC doesn't apply to voice)
- ✅ Receive inbound SMS from anyone (carriers don't filter incoming)
- ⏳ Send US-to-US SMS (filtered until approval lands)
- ✅ Send international SMS (different path, doesn't need 10DLC)

We show a friendly status banner: *"SMS to US numbers: pending carrier approval (usually 1-3 business days). Calls and international SMS are working now."*

## What does the tenant see if they try to send US SMS during the pending window?

The send button works, the message attempts, the bubble appears. If the carrier rejects, the bubble flips to red with a clear message:

> *"This message couldn't be delivered — your 10DLC carrier registration is still pending approval. Try again in 1-2 days, or contact support."*

No mystery, no "the CRM is broken" panic.

## Why it's "no work per tenant" for us

The whole 10DLC flow is API-driven. Every piece — brand registration, campaign submission, number attachment, status updates — is a call our backend makes to Telnyx. There's no portal we click through, no support email we send. The carriers do their review automatically; Telnyx forwards us the approval status; we update the tenant's row in the database.

So whether you have **5 tenants or 5,000 tenants**, the operations cost stays roughly flat. Each tenant pays Telnyx ~$2-10/mo for their own registration (which we either pass through in their pricing or absorb if it's a perk).

Compare with the alternative — manual registration: each tenant onboarding would require an ops person to fill out a Telnyx portal form, wait for approval, manually attach numbers. **That doesn't scale.** Once you're past 50 tenants, you'd need a dedicated person doing it full-time.

## The numbers

For a typical Roof-Aid tenant:

| | Cost |
|---|---|
| **One-time** | ~$4 (sole prop) or ~$40 (LLC) for brand vetting |
| **Per month** | ~$2 (sole prop) or ~$10 (LLC) for campaign |
| **Per SMS sent** | ~$0.0075 inside US (already cheap) |
| **Throughput** | 75 SMS/min (sole prop) — way more than a roofer needs |

For Roof-Aid's pricing, this gets baked into the subscription: *"$X/mo includes a verified business line, voice + SMS up to N messages."* Tenants don't see "10DLC fee" on their invoice — they just see "Roof-Aid subscription".

## Timeline

Here's what we tell a new tenant during onboarding:

> *"Your phone number is live for calls and international SMS immediately. US-to-US SMS becomes active automatically within 1-3 business days while the carriers approve your business registration. You'll get a notification when it's done — no action needed from you."*

This is a single sentence in the onboarding flow. Most tenants won't even notice — by the time they actually need to text a homeowner, the carriers have approved.

## Compliance — the tenant owns it, we facilitate

Each tenant registers under **their own** business identity (their LLC's EIN). They are the legal entity sending the messages; Roof-Aid is the platform routing them. This is structurally cleaner than registering everything under "Roof-Aid the platform" because:

- If one tenant violates SMS rules (sends spam, ignores STOP), only their brand gets flagged — other tenants stay clean.
- Carriers can see who's actually sending — better deliverability for everyone.
- Liability stays with the tenant (where it should be — they wrote the messages).

This is the same isolation principle as the per-tenant Telnyx connections we already have for calling: every tenant is sealed off from every other tenant at the carrier and platform layers, not just at the database level.

## What we still need to build

The 10DLC handling isn't built yet. It's planned for after the basic calling features ship. The work is roughly:

- Add the 10DLC fields to onboarding Step 1 (~half a day of UI)
- Add the API integration that sends them to Telnyx (~half a day)
- Add status tracking in the tenant dashboard ("pending → approved")  (~half a day)
- Test with a real tenant signup end-to-end (~half a day)

Total: about 2 days of focused engineering. Justified once you have your first real US tenant ready to go live.

## The short version, again

- 10DLC = a one-time business registration that US carriers require for SMS to work reliably
- Without it, ~95% of texts to T-Mobile users get silently dropped
- It's automated end-to-end on our side — tenant fills one form, our software handles everything else
- Costs each tenant a few dollars a month, baked into their subscription
- Approval takes 1-3 business days, the only delay is the carriers reviewing, not anything we do
- Scales infinitely — onboarding tenant #5 looks identical to onboarding tenant #5,000
