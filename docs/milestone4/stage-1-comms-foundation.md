# Stage 1 — Communications Foundation

**Goal:** Lay the database, RPC, webhook, and Vault scaffolding that every subsequent M4 stage stands on. By the end, signed webhooks land cleanly into an audit table, `can_call()` / `can_message()` / `mark_sms_read()` work end-to-end, and the call-recordings storage bucket is locked to per-tenant paths.

**Outcome:** Stages 2–4 plug into the same scaffolding; nobody re-solves "where do call events get stored" or "where does a DNC check live".

**Estimated time:** 1.5 days

---

## 1. Schema migrations

Three migrations under `supabase/migrations/`:

### `010_comms_schema_extensions.sql`

- **Tenant config**: adds `timezone`, `calling_hours` (jsonb per-day), `sms_templates`, `email_templates`, `recording_disclosure_audio_url`. (`telnyx_main_number`, `telnyx_app_id`, `sendgrid_subuser` already exist from M1.)
- **Idempotency uniques**: partial UNIQUE indexes on the existing `call_logs.telnyx_call_id`, `sms_logs.telnyx_message_id`, `email_logs.sendgrid_message_id` columns. We don't rename — these column names are already in `apps/web/lib/supabase/database.types.ts` and renaming would require a coordinated web change.
- **`sms_logs` enhancements**: adds `delivery_status` (richer enum than the existing `status` — `queued / sent / delivered / failed / received`), `read_at`, `sent_at`. A trigger keeps `status` and `delivery_status` in sync until the web team can drop the old column. Existing rows are backfilled.
- **`webhook_events` table**: every inbound provider webhook lands here BEFORE dispatching, with the signature-verification result. RLS deny-all (service-role only).
- **`tasks` table**: async work queue used by `send_sms` / `send_email` to enqueue Telnyx / SendGrid API calls so RPCs return fast. RLS deny-all.

### `011_can_rpc.sql`

Three SQL functions, all `SECURITY DEFINER` and granted to `authenticated`:

- **`can_call(uuid)` → jsonb** — verdict for "may we dial this prospect right now". Hard-block reasons: `not_found`, `cross_tenant`, `no_phone`, `outside_calling_hours`. **DNC is NOT a hard block** per client policy — it's surfaced as a `do_not_call_warning: true` field on the verdict so the UI can decorate the call button (red border, tooltip) without disabling it.
- **`can_message(uuid)` → jsonb** — same shape, no calling-hours check. SMS quiet-hours are enforced at the carrier level if needed; we don't double-enforce in v1.
- **`mark_sms_read(uuid)` → void** — `SECURITY INVOKER`. Mobile fires this fire-and-forget on tab open and on Realtime updates. Tenant-scoped via `public.get_tenant_id()`.

A private helper `_prospect_dnc_flagged(uuid)` is used by both verdict functions; it's not granted to `authenticated`, only callable from inside the SECURITY DEFINER bodies.

### `012_call_recordings_bucket.sql`

Creates the `call-recordings` private bucket and attaches a SELECT-only RLS policy: a user can read recordings whose path starts with their own `tenant_id`. Writes go through service-role only (the Telnyx webhook will fetch the recording from Telnyx and upload it; the user never POSTs to this bucket).

---

## 2. ⚠️ DNC policy — the one-line summary

`can_call` and `can_message` **never** return `allowed: false` for a DNC flag. The `do_not_call_warning` field in the verdict and the page-level `DncBanner` provide the warning; the agent decides whether to proceed and accepts responsibility for the contact. This matches the M3-6 client deviation already accepted on web.

`send_sms` (Stage 3) and the click-to-call path (Stage 2) **must NOT raise on DNC**. The Stage 5 audit pass verifies this end-to-end.

Calling-hours stays a hard block (TCPA quiet-hours rule, separate compliance regime).

---

## 3. Vault: signing secrets

Both webhooks must verify signatures **before** dispatching. Run once via Supabase Dashboard → SQL Editor (or psql with service role):

```sql
SELECT vault.create_secret('TELNYX_PUBLIC_KEY',   '<paste from Telnyx Portal>');
SELECT vault.create_secret('SENDGRID_PUBLIC_KEY', '<paste from SendGrid Event Webhook settings>');
SELECT vault.create_secret('TELNYX_API_KEY',      '<paste from Telnyx>');
SELECT vault.create_secret('SENDGRID_API_KEY',    '<paste from SendGrid>');
```

The Edge Functions read these via `vault.decrypted_secrets`. Cached for the function instance lifetime (cold-start scope) so we don't hit Vault on every call.

**Never** put these in `.env` — they end up in build caches.

---

## 4. Webhook scaffolds

Six new files under `supabase/functions/`:

- `_shared/cors.ts` — permissive CORS headers for browser-fronted testing
- `_shared/admin-client.ts` — service-role Supabase client factory (singleton per cold start)
- `_shared/get-vault-secret.ts` — Vault reader with in-memory cache
- `_shared/telnyx-signature.ts` — Ed25519 verification with 5-min replay window
- `_shared/sendgrid-signature.ts` — ECDSA P-256 verification with DER → raw transcoding
- `_shared/log-webhook.ts` — `webhook_events` insert + processed-marker helpers

Plus the two webhook entry points:

- `telnyx-webhook/index.ts` — verifies signature, logs the event, 200s. Stage 2 plugs in `call.*` dispatch; Stage 3 plugs in `message.*` dispatch (including STOP-keyword auto-DNC + auto-reply).
- `sendgrid-webhook/index.ts` — same shape. Detects multipart for the Inbound Parse path. Stage 4 plugs in dispatch.

Both endpoints **always** return within ~50 ms (or 401 for forged signatures); long work moves to the `tasks` queue.

---

## 5. Wire-up tasks

| Task | Verify |
|------|--------|
| Run migrations 010–012 against dev DB | `\d tenants` shows new columns; `SELECT can_call('<seed prospect uuid>')` returns `{allowed:true, do_not_call_warning:false}` |
| Insert Vault secrets | `SELECT name FROM vault.decrypted_secrets` returns 4 rows |
| Deploy `telnyx-webhook` and `sendgrid-webhook` Edge Functions | `supabase functions list` shows both |
| Configure webhook URLs in Telnyx + SendGrid portals | Send a test event from each portal → `webhook_events` row appears |
| `users.telnyx_extension` column | Already exists from M1; just populate seed agents (e.g. `1001`, `1002`) |

---

## 6. Done when

- [ ] Forging a webhook payload with a wrong signature → 401, row in `webhook_events` with `signature_ok = false`
- [ ] Re-sending the same valid Telnyx event 3× via `curl --data-raw` → 3 rows in `webhook_events` (audit), 0 rows in `call_logs` (no dispatcher yet)
- [ ] `SELECT can_call('<seeded prospect>')` returns `{allowed:true}` during business hours
- [ ] Setting that prospect's `do_not_call = true` → `can_call` STILL returns `allowed: true` but `do_not_call_warning: true`. **(This is the policy — verify it works as designed.)**
- [ ] `can_call` returns `{allowed:false, reason:'outside_calling_hours', today_hours: {...}, tz: 'America/Chicago'}` when invoked at 21:00 local
- [ ] `can_call` returns `{allowed:false, reason:'no_phone'}` for a prospect with `phones = '{}'`
- [ ] `can_message` is identical except no calling-hours field
- [ ] `mark_sms_read('<id>')` updates only the caller's tenant rows (cross-tenant attempt is a no-op)

Once those pass, Stage 2 (web softphone) and Stage 3 (web SMS + the mobile-blocking `send_sms` RPC) can plug real handlers into the dispatchers. Nothing else in M4 builds correctly without this foundation.
