-- ============================================================
-- ROOF-AID CRM — Core Tables (Tier 1)
-- Created in FK dependency order
-- ============================================================

-- 1. TENANTS
CREATE TABLE tenants (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  slug                    text UNIQUE NOT NULL,
  plan_tier               smallint DEFAULT 1,
  billing_cycle           text DEFAULT 'monthly',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  trial_expires_at        timestamptz,
  is_active               boolean DEFAULT true,
  is_suspended            boolean DEFAULT false,
  features                jsonb DEFAULT '{
    "crmCore": true,
    "humanCalling": true,
    "mobileApp": true,
    "leads": false,
    "aiCaller": false,
    "supplements": false,
    "supplementCommission": false,
    "computerVision": false,
    "advancedAnalytics": false,
    "apiAccess": false,
    "whiteLabel": false
  }'::jsonb,
  settings                jsonb DEFAULT '{}'::jsonb,
  telnyx_app_id           text,
  telnyx_main_number      text,
  sendgrid_subuser        text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- 2. USERS
CREATE TABLE users (
  id                  uuid PRIMARY KEY,  -- matches auth.users.id
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('super_admin', 'owner', 'admin', 'telefonista', 'rufero')),
  first_name          text,
  last_name           text,
  email               text NOT NULL,
  phone               text,
  telnyx_extension    text,
  sendgrid_sender     text,
  home_base_address   text,
  home_base_coords    point,
  fcm_token           text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 3. PROSPECTS
CREATE TABLE prospects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  address           text,
  city              text,
  state             text,
  zip               text,
  coordinates       point,
  geohash           text,
  phones            text[],
  email             text,
  home_value        numeric,
  hail_size         numeric,
  status            text DEFAULT 'new_leads',
  tipo              text,
  source            text,
  assigned_to       uuid REFERENCES users(id),
  assigned_by       uuid REFERENCES users(id),
  assigned_at       timestamptz,
  do_not_call       boolean DEFAULT false,
  do_not_call_reason text,
  do_not_call_at    timestamptz,
  tags              text[],
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 4. APPOINTMENTS
CREATE TABLE appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id           uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  rufero_id             uuid NOT NULL REFERENCES users(id),
  created_by            uuid REFERENCES users(id),
  scheduled_at          timestamptz NOT NULL,
  duration_minutes      int DEFAULT 60,
  status                text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no-show', 'rescheduled')),
  notes                 text,
  cancellation_reason   text,
  rescheduled_from      uuid REFERENCES appointments(id),
  reminder_24h_sent     boolean DEFAULT false,
  reminder_2h_sent      boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- 5. DOCUMENTS
CREATE TABLE documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id         uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type                text NOT NULL CHECK (type IN ('3rd_party_auth', 'acv_contract', 'rcv_contract', 'supplement')),
  status              text DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'signed')),
  storage_path        text,
  signed_storage_path text,
  signed_at           timestamptz,
  signed_by           uuid REFERENCES users(id),
  signature_url       text,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 6. CALL LOGS
CREATE TABLE call_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id       uuid REFERENCES prospects(id) ON DELETE SET NULL,
  agent_id          uuid REFERENCES users(id),
  direction         text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number       text,
  to_number         text,
  duration_seconds  int,
  disposition       text CHECK (disposition IN ('answered', 'no_answer', 'voicemail', 'wrong_number', 'dnc_request', 'callback_requested')),
  recording_url     text,
  telnyx_call_id    text,
  source            text DEFAULT 'human' CHECK (source IN ('human', 'ai-agent')),
  created_at        timestamptz DEFAULT now()
);

-- 7. SMS LOGS
CREATE TABLE sms_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id         uuid REFERENCES prospects(id) ON DELETE SET NULL,
  agent_id            uuid REFERENCES users(id),
  direction           text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number         text,
  to_number           text,
  body                text,
  status              text CHECK (status IN ('sent', 'delivered', 'failed')),
  telnyx_message_id   text,
  created_at          timestamptz DEFAULT now()
);

-- 8. EMAIL LOGS
CREATE TABLE email_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id           uuid REFERENCES prospects(id) ON DELETE SET NULL,
  agent_id              uuid REFERENCES users(id),
  direction             text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject               text,
  body                  text,
  status                text CHECK (status IN ('sent', 'delivered', 'bounced', 'failed')),
  sendgrid_message_id   text,
  created_at            timestamptz DEFAULT now()
);

-- 9. ACTIVITIES (audit log)
CREATE TABLE activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id   uuid REFERENCES prospects(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id),
  type          text NOT NULL CHECK (type IN ('status_change', 'note_added', 'call', 'sms', 'email', 'appointment', 'document', 'assignment', 'dnc')),
  metadata      jsonb,
  created_at    timestamptz DEFAULT now()
);

-- 10. NOTES
CREATE TABLE notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id   uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES users(id),
  body          text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

-- 11. NOTIFICATIONS
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  type          text CHECK (type IN ('appointment_assigned', 'document_signed', 'inbound_call', 'inbound_sms', 'lead_assigned', 'system_alert')),
  title         text,
  body          text,
  related_id    uuid,
  related_type  text CHECK (related_type IN ('prospect', 'appointment', 'document')),
  is_read       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- 12. PLATFORM CONFIG
CREATE TABLE platform_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz DEFAULT now()
);

-- 13. SUPPLEMENTS
CREATE TABLE supplements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id         uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  document_id         uuid REFERENCES documents(id),
  claim_value         numeric,
  commission_amount   numeric,
  status              text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'denied')),
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 14. COMMISSION TRANSACTIONS
CREATE TABLE commission_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplement_id       uuid NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  claim_value         numeric,
  commission_amount   numeric,
  status              text DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'paid', 'disputed')),
  stripe_invoice_id   text,
  disputed_at         timestamptz,
  dispute_reason      text,
  resolved_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- 15. INSPECTION REPORTS
CREATE TABLE inspection_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id     uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES appointments(id),
  rufero_id       uuid NOT NULL REFERENCES users(id),
  damage_data     jsonb,
  photo_urls      text[],
  ai_analysis     jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
