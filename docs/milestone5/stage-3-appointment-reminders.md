# Stage 3 — Appointment Reminders Edge Function

**Goal:** Homeowners automatically get a "Your inspection is tomorrow at 2:00 PM" SMS 24 hours before, and a "Your inspection is in 2 hours" SMS 2 hours before. Idempotent — the cron can run every minute or every hour and we never send two of the same reminder. Cancelling an appointment 2.5h before the visit stops the 2h reminder.

**Outcome:** No-show rate drops from 18–25% to single digits. The biggest single revenue lever in M5.

**Estimated time:** 1 day

---

## 1. Why this is its own stage

Reminders look like a single Edge Function, but the failure modes are nasty enough to deserve isolated thinking:

- **Idempotency** — if the function runs and crashes mid-batch, the next run can't re-send the reminders that already went out.
- **Time zones** — "24 hours before" means 24h before in the tenant's local clock, not server UTC.
- **Cancellation race** — cancel an appointment 2.5h before, the cron fires at 2:00:30h before, and we send a reminder for an appointment that no longer needs one.
- **Template rendering** — placeholders must substitute the right prospect's data into the right tenant's template.

Bundling this with Stage 2 invites short-cuts on each of these. Isolated, it gets the audit it needs.

---

## 2. Database changes

### 2.1 Migration: `0XX_m5_appointment_reminders.sql`

```sql
CREATE TABLE appointment_reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id        uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('24h', '2h')),
  scheduled_send_at     timestamptz NOT NULL,   -- the moment we should send
  sent_at               timestamptz,             -- null until success
  provider_message_id   text,                    -- Telnyx message id for tracking
  failure_reason        text,                    -- last error if !sent
  attempts              int NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),

  -- Idempotency: one row per (appointment, kind).
  UNIQUE (appointment_id, kind)
);

CREATE INDEX appointment_reminders_due_idx
  ON appointment_reminders (scheduled_send_at)
  WHERE sent_at IS NULL;

ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_reminders_select_tenant
  ON appointment_reminders FOR SELECT
  USING (tenant_id = current_tenant_id());

-- No INSERT/UPDATE policy for users — only the Edge Function (service-role) writes.
```

### 2.2 Trigger: create reminders when an appointment is scheduled

```sql
CREATE OR REPLACE FUNCTION schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- On INSERT of a pending/confirmed appointment → queue both reminders.
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'confirmed') THEN
    INSERT INTO appointment_reminders (tenant_id, appointment_id, kind, scheduled_send_at)
    VALUES
      (NEW.tenant_id, NEW.id, '24h', NEW.scheduled_at - interval '24 hours'),
      (NEW.tenant_id, NEW.id, '2h',  NEW.scheduled_at - interval '2 hours');
    RETURN NEW;
  END IF;

  -- On UPDATE: if scheduled_at moved, re-queue (only if not already sent).
  IF TG_OP = 'UPDATE' AND OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
    UPDATE appointment_reminders
    SET scheduled_send_at = NEW.scheduled_at - interval '24 hours'
    WHERE appointment_id = NEW.id AND kind = '24h' AND sent_at IS NULL;

    UPDATE appointment_reminders
    SET scheduled_send_at = NEW.scheduled_at - interval '2 hours'
    WHERE appointment_id = NEW.id AND kind = '2h' AND sent_at IS NULL;
    RETURN NEW;
  END IF;

  -- On status change to terminal → delete pending reminders.
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('cancelled', 'no_show', 'completed', 'rescheduled')
     AND OLD.status NOT IN ('cancelled', 'no_show', 'completed', 'rescheduled') THEN
    DELETE FROM appointment_reminders
    WHERE appointment_id = NEW.id AND sent_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_reminder_lifecycle
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION schedule_appointment_reminders();
```

**Why a trigger and not the server action?** The server action could miss edge cases (raw SQL updates, future bulk imports). The trigger guarantees every appointment row's reminders are in sync, regardless of how the row got there.

### 2.3 pg_cron schedule

```sql
-- Run every 5 minutes. Each run processes anything due in the next 5 minutes.
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := current_setting('app.supabase_functions_url') || '/send-appointment-reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.cron_invoke_secret'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);
```

> `pg_net` + `pg_cron` are both Supabase-managed extensions. Verify enabled. The cron secret is a separate token (not `service_role`) created via Supabase Vault — the Edge Function rejects requests without it.

---

## 3. Edge Function — `send-appointment-reminders`

### 3.1 Location

```
supabase/functions/send-appointment-reminders/
├── index.ts
├── lib/
│   ├── telnyx.ts          # SMS send wrapper (reuse from M4)
│   ├── template.ts        # placeholder substitution
│   └── auth.ts            # verify cron invoke secret
└── deno.json
```

### 3.2 Algorithm

```ts
// supabase/functions/send-appointment-reminders/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSms } from "../_shared/telnyx.ts";
import { renderTemplate } from "../_shared/template.ts";
import { verifyCronSecret } from "./lib/auth.ts";

Deno.serve(async (req) => {
  if (!verifyCronSecret(req)) return new Response("unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Pull all due reminders (within the next 5 minutes, but also up to 30 min late).
  //    Late ones still send — it's better to be late than skip.
  const { data: due } = await supabase
    .from("appointment_reminders")
    .select(`
      id, tenant_id, kind, scheduled_send_at, attempts,
      appointment:appointments!inner(
        id, scheduled_at, status, duration_minutes,
        prospect:prospects!inner(id, name, phones),
        tenant:tenants!inner(id, name, timezone, sms_templates)
      )
    `)
    .is("sent_at", null)
    .lte("scheduled_send_at", new Date(Date.now() + 5 * 60 * 1000).toISOString())
    .lt("attempts", 5)
    .order("scheduled_send_at")
    .limit(100);

  if (!due?.length) return new Response("no due reminders", { status: 200 });

  const results = await Promise.allSettled(
    due.map((r) => processReminder(supabase, r))
  );

  // 2. Telemetry only — don't fail the response if individual sends failed.
  console.log(JSON.stringify({
    processed: due.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  }));

  return new Response("ok", { status: 200 });
});

async function processReminder(supabase, reminder) {
  const appt = reminder.appointment;

  // Skip if the appointment is no longer in a state that needs a reminder.
  // (Trigger should have deleted, but belt-and-suspenders.)
  if (!["pending", "confirmed"].includes(appt.status)) {
    await supabase
      .from("appointment_reminders")
      .delete()
      .eq("id", reminder.id);
    return;
  }

  // No phone, no reminder. Mark sent with failure_reason so we don't retry.
  const phone = appt.prospect.phones?.[0];
  if (!phone) {
    await supabase
      .from("appointment_reminders")
      .update({ sent_at: new Date().toISOString(), failure_reason: "no_phone" })
      .eq("id", reminder.id);
    return;
  }

  // Pick template (24h or 2h), fallback to default.
  const template = pickTemplate(appt.tenant.sms_templates, reminder.kind);
  const body = renderTemplate(template, {
    homeowner_name: appt.prospect.name,
    appointment_time: formatInTimezone(appt.scheduled_at, appt.tenant.timezone),
    company_name: appt.tenant.name,
  });

  try {
    const result = await sendSms({
      to: phone,
      body,
      tenant_id: appt.tenant.id,
      // Tag SMS log with a synthetic prospect/appointment trace.
      metadata: {
        kind: "appointment_reminder",
        appointment_id: appt.id,
        reminder_kind: reminder.kind,
      },
    });

    await supabase
      .from("appointment_reminders")
      .update({
        sent_at: new Date().toISOString(),
        provider_message_id: result.id,
        attempts: reminder.attempts + 1,
      })
      .eq("id", reminder.id);
  } catch (e) {
    // Failure: bump attempts, record reason. Cron will retry next run.
    await supabase
      .from("appointment_reminders")
      .update({
        attempts: reminder.attempts + 1,
        failure_reason: String(e),
      })
      .eq("id", reminder.id);
  }
}
```

### 3.3 Template lookup

`tenants.sms_templates` is `jsonb[]` (M4 schema). Templates have `{id, name, body, active, kind}`. Pick by `kind === 'appointment_reminder_24h' | 'appointment_reminder_2h'`.

Fallback templates (used if a tenant hasn't configured one — hardcoded in the Edge Function):

```ts
const FALLBACK_24H = `Hi {homeowner_name}, this is a reminder from {company_name} — your roof inspection is scheduled for {appointment_time}. Reply STOP to unsubscribe.`;
const FALLBACK_2H  = `Hi {homeowner_name}, your roof inspection with {company_name} is in 2 hours ({appointment_time}). Reply STOP to unsubscribe.`;
```

> "Reply STOP to unsubscribe" is **legally required** on every reminder. Bake into the fallback so a tenant who deletes their template still gets compliant SMS.

### 3.4 Time-zone formatting

```ts
function formatInTimezone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  // → "Tue, May 14, 2:00 PM"
}
```

> `Intl.DateTimeFormat` ships in Deno. No new dep.

### 3.5 SMS send through `can_message`

The shared `sendSms()` (from M4) already calls `can_message(prospect_id)` before sending — so a homeowner who replied STOP in the last 24h automatically gets skipped. The Edge Function doesn't reimplement that.

If `can_message` returns `{allowed: false, reason: 'dnc'}`:
- Don't send.
- Mark `appointment_reminders.sent_at = now()` with `failure_reason = 'dnc'`.
- Optionally insert a `notifications` row so the Telefonista is told their reminder didn't go out (so they can call instead).

---

## 4. Operational concerns

### 4.1 Observability

- All reminder send/fail events logged via the existing M4 `webhook_events` (or `tasks` if that's what M4 ended up using).
- Add a Supabase log alert: `processed > 0 && succeeded === 0` for 3 consecutive runs → page on-call.
- Add a "Reminders dashboard" in admin (Stage M7) — for M5, the SQL is enough:
  ```sql
  SELECT kind, count(*) FILTER (WHERE sent_at IS NULL AND scheduled_send_at < now()) AS overdue
  FROM appointment_reminders
  GROUP BY kind;
  ```

### 4.2 Retry policy

- `attempts < 5` → retry next cron run.
- `attempts >= 5` → stop retrying. Mark `failure_reason = 'max_retries'` and surface in admin tools.
- No exponential backoff — cron is already coarse enough (every 5 min).

### 4.3 Cron secret rotation

Stored in Supabase Vault as `cron_invoke_secret`. Rotate quarterly. The Edge Function reads it on cold start.

### 4.4 Local testing

Add a manual trigger:
```bash
supabase functions invoke send-appointment-reminders \
  --header "x-cron-secret: $(supabase secrets get cron_invoke_secret)"
```

And a seed helper:
```sql
-- Mock an appointment 1 minute from now so reminders fire on the next cron run.
INSERT INTO appointments (...)
VALUES (...);  -- prep, then:
UPDATE appointment_reminders
SET scheduled_send_at = now()
WHERE appointment_id = '<that-appointment-id>';
```

---

## 5. Acceptance criteria

- [ ] Booking an appointment 25h from now → two `appointment_reminders` rows inserted (`24h` at +1h, `2h` at +23h)
- [ ] Cron fires at the `24h` row's `scheduled_send_at` → SMS sent → `sent_at` set, `provider_message_id` populated
- [ ] Same cron firing 10× in quick succession → exactly one SMS sent (idempotency via `sent_at`)
- [ ] Rescheduling the appointment from `+25h` to `+72h` → both pending reminders updated to the new times
- [ ] Cancelling the appointment → both pending reminders deleted (verify in DB)
- [ ] Reminder for a DNC-flagged prospect → no SMS sent, row marked `sent_at` with `failure_reason='dnc'`
- [ ] Reminder for a prospect with no phone → no SMS sent, `failure_reason='no_phone'`
- [ ] Template placeholders substitute correctly: `{homeowner_name}`, `{appointment_time}` in tenant timezone, `{company_name}`
- [ ] Tenant with no `appointment_reminder_24h` template → fallback template used
- [ ] Cron secret missing or wrong → Edge Function returns 401
- [ ] SMS body always contains "Reply STOP to unsubscribe"
- [ ] After 5 failed attempts on the same reminder → stops retrying

---

## 6. Pitfalls to avoid

- **Don't** delete the `appointment_reminders` row on success. Keep it (with `sent_at` set) for audit. Storage cost is negligible.
- **Don't** rely on the cron running exactly on time. Pull reminders due in the **next 5 minutes** and also overdue ones (no upper bound) — Supabase cron can run a minute late under load.
- **Don't** send reminders for appointments in terminal states. The trigger should have deleted them, but the Edge Function double-checks.
- **Don't** compute "24 hours before" as `scheduled_at - 24*3600*1000`. That's fine for UTC math, but a daylight-savings boundary will throw it off by an hour. `interval '24 hours'` in Postgres handles it cleanly.
- **Don't** put the SMS body together in the trigger. Templates and placeholders belong in the Edge Function where the tenant config is fully loaded.
- **Don't** assume the homeowner phone is `phones[0]`. If a tenant in M7+ adds a "primary phone" selector, this becomes a column lookup. For M5, `phones[0]` is fine — document the assumption.
- **Don't** retry indefinitely. After 5 attempts, surface the failure; don't silently spam.
- **Don't** forget the recording/messaging disclosure footer. SMS without "STOP to unsubscribe" risks a TCPA flag.

---

## 7. What ships at end of Stage 3

- 1 migration: `appointment_reminders` table + reminder-lifecycle trigger
- 1 pg_cron schedule
- 1 Edge Function: `send-appointment-reminders`
- 1 template helper + fallback content
- Vault entries: `cron_invoke_secret`
- Manual test harness

Stage 4 picks up PDF generation, which is fully independent of this stage's work.
