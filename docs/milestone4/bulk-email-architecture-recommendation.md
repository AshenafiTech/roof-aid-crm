# Bulk Email Architecture — Recommendation

**Status:** Proposal
**Author:** Engineering
**Date:** 2026-05-16
**Supersedes (in part):** `stage-4-web-email.md` (SendGrid plan — never implemented)

## 1. Context

The CRM currently supports **1:1 email** through per-user Gmail OAuth (M4). This is the right tool for individual sales replies but is unsuitable for the product requirement now in scope: **tenants must be able to send bulk/campaign email to their prospect lists**.

Constraints driving this design:

1. **Tenants are non-technical.** Telefonistas and tenant admins cannot be expected to register domains, edit DNS records, or paste DKIM keys.
2. **Bulk sending is a first-class feature**, not a nice-to-have. Tenants need campaigns, lists, scheduling, and delivery tracking.
3. **Each tenant has many telefonistas.** Each telefonista has their own identity and needs replies routed back to them, while supervisors need full visibility in the CRM.
4. **Multi-tenant reputation isolation is required** — one tenant's bad sending behavior must not poison deliverability for others.
5. **Existing schema** already anticipates an ESP integration (`tenants.sendgrid_subuser`, `users.sendgrid_sender`, `webhook_events.provider` accepts `'sendgrid'`).

## 2. Why Gmail OAuth alone cannot satisfy this

| Limit | Impact |
|---|---|
| 500 recipients/day (free) or 2,000/day (Workspace) | Cannot support campaign volume |
| Google TOS prohibits bulk marketing via personal Gmail | Account suspension risk for tenants |
| Reply-handling lives in each user's personal inbox | No CRM visibility, no supervisor oversight |
| Per-user OAuth required for every new telefonista | Onboarding friction; broken when staff turns over |
| No deliverability tracking (opens, bounces, complaints) | Cannot enforce list hygiene |

**Gmail OAuth stays — for 1:1 follow-ups only.** Bulk requires a dedicated ESP.

## 3. Recommended Architecture

### 3.1 ESP choice: Resend

**Resend** over SendGrid for this codebase:

- Modern domain API returns DNS records as structured data — enables programmatic provisioning.
- React Email templates fit our Next.js stack.
- Webhooks for `delivered`, `bounced`, `opened`, `clicked`, `complained`.
- Inbound parse for reply routing.

SendGrid would work equivalently (and matches the existing schema hints) but requires more code to manage subusers and templates. The architecture below is provider-agnostic — we will isolate Resend behind a `lib/email/provider.ts` abstraction so a future swap is contained.

### 3.2 Platform-managed sending domain

**The platform owns a single dedicated domain** — proposed: `roofaid-send.com` (kept separate from `roofaid.com` so any reputation hit does not affect auth or transactional mail).

Every tenant gets an **auto-provisioned subdomain** on signup:

```
acme.roofaid-send.com         → Acme Roofing
bobs-roofing.roofaid-send.com → Bob's Roofing
```

**The tenant never sees DNS, DKIM, SPF, or subdomain configuration.**

### 3.3 Automatic subdomain provisioning

Triggered server-side at tenant creation. Two APIs involved:

1. **Resend Domains API** — registers the subdomain and returns the DNS records it needs.
2. **Cloudflare DNS API** (the platform's DNS host for `roofaid-send.com`) — publishes those records to the zone we control.

```ts
// lib/email/provision.ts (sketch)
async function provisionTenantSubdomain(tenant: Tenant) {
  const subdomain = await uniqueSlug(tenant.name);
  const fullDomain = `${subdomain}.roofaid-send.com`;

  const resendDomain = await resend.domains.create({ name: fullDomain });

  for (const record of resendDomain.records) {
    await cloudflare.dns.records.create({
      zone_id: CLOUDFLARE_ZONE_ID,
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: 300,
    });
  }

  await resend.domains.verify(resendDomain.id);

  await db.tenants.update(tenant.id, {
    send_subdomain: subdomain,
    resend_domain_id: resendDomain.id,
    domain_status: 'pending',
  });

  await enqueue('verify-domain', { tenant_id: tenant.id }, { delay: 30_000 });
}
```

A background job polls Resend until `status = 'verified'` (typically <60s on Cloudflare), then flips `tenants.domain_status = 'verified'` and unlocks sending.

**Reserved slugs** (`www`, `api`, `mail`, `admin`, `app`, `noreply`, etc.) are blocked. Collisions append numeric suffixes.

### 3.4 Per-telefonista identity

Once a subdomain is verified, **any local-part** on it is a valid sender. No per-user verification step is needed.

```
Maria Garcia <maria@acme.roofaid-send.com>
Juan López   <juan@acme.roofaid-send.com>
Pedro Ramos  <pedro@acme.roofaid-send.com>
```

The local-part is derived from the user record at send time:

```ts
function buildFromAddress(user: User, tenant: Tenant): string {
  const local = user.email_local
    ?? slugify(user.full_name)
    ?? user.id.slice(0, 8);
  return `${user.full_name} <${local}@${tenant.send_subdomain}.roofaid-send.com>`;
}
```

Unique constraint `(tenant_id, email_local)` prevents collisions within a tenant.

### 3.5 Reply routing — replies land back in the CRM

Replies are routed back into the CRM via Resend's **inbound parse**, not to telefonistas' personal inboxes. This is essential for a call-center model: supervisors need conversation visibility, prospect history must persist when staff turns over, and assignments must be transferable.

Set `Reply-To` to a per-thread address on a dedicated inbound subdomain:

```
From:     Maria Garcia <maria@acme.roofaid-send.com>
Reply-To: reply+t_abc123@inbound.roofaid-send.com
```

`inbound.roofaid-send.com` has MX records pointing at Resend's inbound endpoint. When a prospect replies:

1. Resend hits `POST /api/webhooks/inbound`.
2. Handler decodes the thread token (`t_abc123`) → resolves tenant, telefonista, prospect.
3. Reply is inserted into `email_logs` as `direction = 'inbound'`.
4. The CRM thread view shows the reply to the telefonista (and supervisors).
5. Optional: push notification or forward-copy to the telefonista's personal email.

### 3.6 Bulk send architecture

```
                ┌──────────────────────┐
  Composer ──►  │ email_campaigns      │  ◄── scheduled / immediate
                │ email_recipients     │
                └──────────┬───────────┘
                           │
                  pg_cron / Edge Function
                           │
                ┌──────────▼───────────┐
                │ Queue worker         │ ─ rate-limited per tenant
                │  - skip suppressions │
                │  - skip DNC flagged  │
                │  - chunked sends     │
                └──────────┬───────────┘
                           │
                       Resend API
                           │
                ┌──────────▼───────────┐
                │ email_logs           │
                └──────────────────────┘
                           ▲
                Resend webhooks (delivered, bounced, opened, clicked, complained)
                           │
                /api/webhooks/resend
```

**Send strategies for campaigns:**

- `fixed` — every recipient gets the same telefonista as sender.
- `assigned_owner` — uses the prospect's existing owner relationship (best for warm follow-ups).
- `round_robin` — rotates across an explicit user set.

### 3.7 Compliance & abuse controls (non-negotiable)

Because tenants share root-domain reputation, these controls are not optional and ship in Phase 1:

| Control | Mechanism |
|---|---|
| **Per-tenant daily throttle** | `tenants.daily_send_limit` (default 200; raise after 30 days clean) — enforced in queue worker |
| **Suppression list** | `email_suppressions` table; every send checks it; hard bounces and complaints auto-suppress |
| **Bounce/complaint circuit breaker** | Auto-pause tenant if 24h bounce > 5% or complaint > 0.1% (Gmail/Yahoo thresholds) |
| **One-click unsubscribe** | `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every campaign send |
| **DNC enforcement** | Filter `prospects.do_not_contact = true` at queue time — already required by SRS |
| **List consent checkbox** | CSV imports require attestation: "I have permission to email these contacts" |

## 4. What the user experiences

### Tenant admin
1. Signs up → answers basic profile questions.
2. Background provisioning completes in <60 seconds.
3. Lands on the email tab. Bulk and 1:1 sending both work immediately.
4. Never sees "DNS," "DKIM," "SPF," or "subdomain."

### Telefonista
1. Logs in → email composer is ready.
2. Sends from `Maria Garcia <maria@acme.roofaid-send.com>` automatically.
3. Replies appear in their CRM thread view (also visible to supervisors).
4. No Gmail connection, no setup, no personal account needed.

### Prospect (recipient)
- Sees `Acme Roofing` (display name) as the sender.
- Reply goes through the CRM but feels seamless.
- One-click unsubscribe works.

## 5. Schema changes

```sql
-- Tenants
ALTER TABLE tenants ADD COLUMN
  send_subdomain TEXT UNIQUE,
  resend_domain_id TEXT,
  domain_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (domain_status IN ('pending', 'verified', 'failed')),
  daily_send_limit INT NOT NULL DEFAULT 200,
  sending_paused_at TIMESTAMPTZ,
  sending_pause_reason TEXT;

-- Users
ALTER TABLE users ADD COLUMN
  email_local TEXT,
  CONSTRAINT users_tenant_email_local_unique UNIQUE (tenant_id, email_local);

-- Email logs (extend existing)
ALTER TABLE email_logs ADD COLUMN
  direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  campaign_id UUID,
  thread_id UUID,
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounce_reason TEXT;

-- New tables
CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,                  -- used in Reply-To
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  template_id UUID,
  send_as_user_id UUID REFERENCES users(id),
  send_as_strategy TEXT NOT NULL DEFAULT 'fixed'
    CHECK (send_as_strategy IN ('fixed', 'round_robin', 'assigned_owner')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed')),
  scheduled_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  send_as_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'suppressed', 'skipped_dnc')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE TABLE email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'unsubscribe', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
```

All new tables get RLS policies scoped to `get_tenant_id()` following the existing pattern.

## 6. Implementation phases

### Phase 1 — Foundation (transactional only)
- Purchase `roofaid-send.com`, configure Cloudflare DNS, create Resend account.
- Provider abstraction `lib/email/provider.ts`.
- Migration: tenant subdomain columns, user `email_local`, extended `email_logs`, `email_suppressions`.
- Auto-provisioning on tenant create + verification poll job.
- Inbound parse webhook + `email_threads`.
- Resend webhook handler (delivered/bounced/opened/clicked/complained).
- Wire the M5 document-email stub ([apps/web/app/(dashboard)/documents/actions.ts:288](apps/web/app/(dashboard)/documents/actions.ts#L288)) to actually send via the new provider.

### Phase 2 — Campaigns
- `email_campaigns` and `email_recipients` tables.
- Queue worker (pg_cron + Edge Function) with per-tenant throttle.
- Bounce/complaint circuit breaker.
- DNC enforcement at queue time.
- Campaign composer UI with list-builder (filter prospects by stage/tag/owner).
- Per-recipient delivery dashboard.

### Phase 3 — Polish
- Template management on `tenants.email_templates`.
- Scheduling, A/B subject lines.
- Per-telefonista performance dashboard (open rates, replies).
- Optional: custom-domain upgrade path for tenants who want full branding (the DNS-paste flow from earlier proposals).

## 7. Decisions deferred / open

- **Inbound forwarding** — should replies also forward to telefonista's personal inbox as a notification, or rely solely on CRM in-app notifications? (Lean: in-app only, to avoid private side-channel conversations.)
- **Gmail OAuth retention** — keep for 1:1 indefinitely, or sunset once Phase 1 ships? (Lean: keep for tenant admins, default new telefonistas to platform sender.)
- **Custom-domain upgrade** — Phase 3 or never? Depends on tenant demand.

## 8. Why this is the right design

- **Zero technical burden on tenants.** The hardest part of email infrastructure (DNS) is hidden completely.
- **Reputation isolation per tenant** via per-subdomain DKIM keys.
- **CRM-native conversations** via inbound parse — supervisor visibility, transferable history, durable across staff turnover.
- **Standard pattern.** This is how Mailchimp, HubSpot, ConvertKit, and Front operate. No invention required.
- **Compliance-first.** Suppressions, throttling, DNC enforcement, and unsubscribe are baked in from Phase 1, not bolted on later.
- **Reuses existing schema scaffolding** (`webhook_events`, `email_logs`, `tenants.email_templates`).
