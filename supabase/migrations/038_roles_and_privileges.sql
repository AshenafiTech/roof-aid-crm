-- ============================================================
-- ROOF-AID CRM — Dynamic Roles & Privileges
-- ============================================================
-- Adds a 3-tier User -> Role -> Privilege model on top of the
-- legacy `users.role text` column. The legacy column stays in
-- place during the cut-over; new code reads `users.role_id` and
-- the helper `public.user_has_privilege()`.
--
-- Default roles per tenant (slug):
--   owner       -> is_super_role = true  (all privileges, web + mobile)
--   admin       -> most privileges       (web + mobile)
--   telefonista -> contact/sales subset  (web + mobile)
--   rufero      -> field-only subset     (mobile only, NO web)
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

-- 1.1 PRIVILEGES — platform-defined catalog (seeded by this migration).
CREATE TABLE privileges (
  slug              text PRIMARY KEY,
  name              text NOT NULL,
  domain            text NOT NULL,
  description       text,
  is_platform_only  boolean NOT NULL DEFAULT false,
  sort_order        int NOT NULL DEFAULT 0
);

COMMENT ON TABLE privileges IS
  'Catalog of fine-grained permissions. Seeded by migrations; not user-creatable.';

-- 1.2 ROLES — bundles of privileges, scoped per tenant.
CREATE TABLE roles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid REFERENCES tenants(id) ON DELETE CASCADE,
  slug              text NOT NULL,
  name              text NOT NULL,
  description       text,
  is_system         boolean NOT NULL DEFAULT false,
  is_super_role     boolean NOT NULL DEFAULT false,
  is_assignable     boolean NOT NULL DEFAULT true,
  login_web         boolean NOT NULL DEFAULT true,
  login_mobile      boolean NOT NULL DEFAULT true,
  privileges_cache  text[] NOT NULL DEFAULT '{}',
  cache_version     int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

COMMENT ON COLUMN roles.is_super_role IS
  'When true, user_has_privilege() returns true for any privilege. Owner + Super Admin only.';
COMMENT ON COLUMN roles.privileges_cache IS
  'Denormalized union of own + inherited privileges. Refreshed by trigger.';

CREATE INDEX roles_tenant_idx ON roles (tenant_id);

-- 1.3 ROLE_PRIVILEGES — many-to-many grants.
CREATE TABLE role_privileges (
  role_id        uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  privilege_slug text NOT NULL REFERENCES privileges(slug) ON DELETE CASCADE,
  PRIMARY KEY (role_id, privilege_slug)
);

-- 1.4 ROLE_PARENTS — DAG of role inheritance.
CREATE TABLE role_parents (
  child_role_id  uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  parent_role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (child_role_id, parent_role_id),
  CHECK (child_role_id <> parent_role_id)
);

-- 1.5 USERS — add role_id (nullable during transition; legacy `role text` stays).
ALTER TABLE users ADD COLUMN role_id uuid REFERENCES roles(id);
CREATE INDEX users_role_id_idx ON users (role_id);

-- ------------------------------------------------------------
-- 2. SEED PRIVILEGE CATALOG
-- ------------------------------------------------------------

INSERT INTO privileges (slug, name, domain, description, sort_order) VALUES
  -- Prospects
  ('view_prospects',                'View Prospects',                  'prospects', 'See prospect records (rufero sees only assigned).', 10),
  ('view_all_prospects',            'View All Prospects',              'prospects', 'See prospects across all assignments (bypasses rufero per-row filter).', 11),
  ('create_prospects',              'Create Prospects',                'prospects', 'Create new prospect records.', 12),
  ('edit_prospects',                'Edit Prospects',                  'prospects', 'Edit prospect fields and notes.', 13),
  ('delete_prospects',              'Delete Prospects',                'prospects', 'Permanently remove prospect records.', 14),
  ('assign_prospects',              'Assign Prospects to Ruferos',     'prospects', 'Change the assigned rufero on a prospect.', 15),
  ('change_prospect_status',        'Change Prospect Status',          'prospects', 'Move prospects between pipeline stages.', 16),
  ('mark_dnc',                      'Mark as Do-Not-Call',             'prospects', 'Flag a prospect Do-Not-Call (TCPA compliance).', 17),

  -- Appointments
  ('view_appointments',             'View Appointments',               'appointments', 'See appointments (rufero sees only own).', 20),
  ('view_all_appointments',         'View All Appointments',           'appointments', 'See appointments across all ruferos.', 21),
  ('create_appointments',           'Create Appointments',             'appointments', 'Schedule new appointments.', 22),
  ('edit_appointments',             'Edit Appointments',               'appointments', 'Modify appointment details.', 23),
  ('delete_appointments',           'Delete Appointments',             'appointments', 'Remove appointments.', 24),
  ('assign_appointment_rufero',     'Assign Rufero to Appointments',   'appointments', 'Change which rufero owns an appointment.', 25),
  ('cancel_appointments',           'Cancel Appointments',             'appointments', 'Cancel scheduled appointments with reason.', 26),
  ('reschedule_appointments',       'Reschedule Appointments',         'appointments', 'Move an appointment to a new time.', 27),
  ('complete_appointments',         'Mark Appointment Complete',       'appointments', 'Mark appointments as completed (field rep).', 28),
  ('mark_appointment_no_show',      'Mark Appointment No-Show',        'appointments', 'Mark appointments as no-show.', 29),
  ('manage_own_availability',       'Manage Own Availability',         'appointments', 'Edit own working hours and availability blocks.', 30),
  ('manage_any_availability',       'Manage Any Rufero Availability',  'appointments', 'Edit other ruferos availability blocks.', 31),

  -- Documents
  ('view_documents',                'View Documents',                  'documents', 'See generated documents within the tenant.', 40),
  ('generate_documents',            'Generate Documents',              'documents', 'Create new contracts and authorization PDFs.', 41),
  ('upload_documents',              'Upload Documents',                'documents', 'Upload existing PDFs as documents.', 42),
  ('download_documents',            'Download Documents',              'documents', 'Download document files.', 43),
  ('sign_documents_as_company',     'Sign Documents (Company)',        'documents', 'Sign documents as the company representative.', 44),
  ('delete_documents',              'Delete Documents',                'documents', 'Soft-delete documents.', 45),
  ('manage_document_templates',     'Manage Document Templates',       'documents', 'Edit the tenant default contract/authorization templates.', 46),
  ('manage_company_signature',      'Manage Company Signature',        'documents', 'Set the saved company signature applied to docs.', 47),

  -- Communications
  ('use_softphone',                 'Use Softphone',                   'communications', 'Make/receive calls through the Telnyx WebRTC softphone.', 60),
  ('send_sms',                      'Send SMS',                        'communications', 'Send outbound SMS to prospects.', 61),
  ('send_email',                    'Send Email (Manual)',             'communications', 'Send one-off emails to prospects.', 62),
  ('connect_google_account',        'Connect Google Account',          'communications', 'OAuth-connect a personal Google account for Gmail send.', 63),
  ('view_call_logs',                'View Call Logs',                  'communications', 'See call history within the tenant.', 64),
  ('view_sms_logs',                 'View SMS Conversations',          'communications', 'See SMS conversation history.', 65),
  ('view_email_logs',               'View Email Logs',                 'communications', 'See sent email history.', 66),

  -- Notes & Activities
  ('view_notes',                    'View Notes',                      'notes', 'Read notes attached to prospects.', 80),
  ('add_notes',                     'Add Notes',                       'notes', 'Add notes on prospects.', 81),
  ('view_activities',               'View Activity / Audit Log',       'notes', 'Read the audit/activity feed.', 82),

  -- Inspections (mobile)
  ('create_inspection_reports',     'Create Inspection Reports',       'inspections', 'Submit on-site inspection reports.', 100),
  ('edit_inspection_reports',       'Edit Inspection Reports',         'inspections', 'Modify existing inspection reports.', 101),
  ('capture_inspection_photos',     'Capture Inspection Photos',       'inspections', 'Take and upload inspection photos.', 102),
  ('capture_homeowner_signature',   'Capture Homeowner Signature',     'inspections', 'Collect the homeowner signature on-site.', 103),

  -- Settings & administration
  ('access_settings',               'Access Settings Section',         'settings', 'Open the Settings menu and pages.', 120),
  ('manage_phone_numbers',          'Manage Phone Numbers',            'settings', 'Buy, label, and route tenant phone numbers.', 121),
  ('manage_notification_preferences','Manage Tenant Notifications',    'settings', 'Edit tenant-wide notification defaults.', 122),
  ('manage_own_notifications',      'Manage Own Notifications',        'settings', 'Edit personal notification preferences.', 123),
  ('manage_users',                  'Manage Users',                    'settings', 'Invite, edit, activate/deactivate users.', 124),
  ('delete_users',                  'Delete Users',                    'settings', 'Permanently remove users.', 125),
  ('manage_roles',                  'Manage Roles & Privileges',       'settings', 'Edit role definitions and privilege assignments.', 126),
  ('manage_tenant_settings',        'Manage Tenant Settings',          'settings', 'Edit working hours, timezone, branding.', 127),
  ('manage_billing',                'Manage Billing & Plan',           'settings', 'Edit tenant billing and subscription.', 128),

  -- Analytics
  ('view_analytics',                'View Analytics',                  'analytics', 'See analytics dashboards and team performance.', 140),
  ('export_analytics',              'Export Analytics',                'analytics', 'Export analytics as CSV/reports.', 141);

-- ------------------------------------------------------------
-- 3. HELPER FUNCTIONS
-- ------------------------------------------------------------

-- 3.1 refresh_role_privileges_cache(role) — recompute the denormalized
-- privilege array for a role and bump its cache_version.
CREATE OR REPLACE FUNCTION public.refresh_role_privileges_cache(p_role uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  result text[];
BEGIN
  -- All ancestors (including self) via the role_parents DAG.
  WITH RECURSIVE role_chain AS (
    SELECT p_role AS id
    UNION
    SELECT rp.parent_role_id
    FROM role_parents rp
    JOIN role_chain rc ON rc.id = rp.child_role_id
  )
  SELECT COALESCE(array_agg(DISTINCT rpr.privilege_slug), '{}')
    INTO result
  FROM role_chain rc
  JOIN role_privileges rpr ON rpr.role_id = rc.id;

  UPDATE roles
     SET privileges_cache = COALESCE(result, '{}'),
         cache_version    = cache_version + 1,
         updated_at       = now()
   WHERE id = p_role;
END;
$$;

-- 3.2 Triggers — refresh affected roles on grants/revokes/parent changes.
CREATE OR REPLACE FUNCTION public._tr_role_privileges_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_role_privileges_cache(OLD.role_id);
    -- Children that inherit through OLD.role_id must also refresh.
    PERFORM public.refresh_role_privileges_cache(rp.child_role_id)
      FROM role_parents rp WHERE rp.parent_role_id = OLD.role_id;
    RETURN OLD;
  ELSE
    PERFORM public.refresh_role_privileges_cache(NEW.role_id);
    PERFORM public.refresh_role_privileges_cache(rp.child_role_id)
      FROM role_parents rp WHERE rp.parent_role_id = NEW.role_id;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_role_privileges_refresh
AFTER INSERT OR DELETE OR UPDATE ON role_privileges
FOR EACH ROW EXECUTE FUNCTION public._tr_role_privileges_refresh();

CREATE OR REPLACE FUNCTION public._tr_role_parents_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_role_privileges_cache(OLD.child_role_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_role_privileges_cache(NEW.child_role_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_role_parents_refresh
AFTER INSERT OR DELETE OR UPDATE ON role_parents
FOR EACH ROW EXECUTE FUNCTION public._tr_role_parents_refresh();

-- 3.3 user_has_privilege(user, privilege) — used by RLS + server actions.
-- Super roles short-circuit to true. Falls back to the legacy `role`
-- column when role_id is still null (transition window).
CREATE OR REPLACE FUNCTION public.user_has_privilege(p_user uuid, p_priv text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.id = p_user
      AND (
        r.is_super_role = true
        OR p_priv = ANY (r.privileges_cache)
        -- Legacy fallback: while role_id is unset, super_admin / owner
        -- behave as the historical "all privileges" group.
        OR (u.role_id IS NULL AND u.role IN ('super_admin', 'owner'))
      )
  );
$$;

-- 3.4 current_user_has_privilege(privilege) — convenience for RLS.
CREATE OR REPLACE FUNCTION public.current_user_has_privilege(p_priv text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.user_has_privilege(auth.uid(), p_priv);
$$;

-- ------------------------------------------------------------
-- 4. SEED DEFAULT ROLES PER TENANT
-- ------------------------------------------------------------
-- Encapsulated in a function so the onboarding flow + this migration
-- can both call it. Idempotent on (tenant_id, slug).
CREATE OR REPLACE FUNCTION public.seed_default_roles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_owner_id       uuid;
  v_admin_id       uuid;
  v_telefonista_id uuid;
  v_rufero_id      uuid;
BEGIN
  -- Owner: is_super_role, web+mobile.
  INSERT INTO roles (tenant_id, slug, name, description, is_system, is_super_role,
                     is_assignable, login_web, login_mobile)
  VALUES (p_tenant_id, 'owner', 'Owner',
          'Full access. Cannot be deleted. One per tenant.',
          true, true, true, true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_owner_id;

  -- Admin: web+mobile, broad privilege set (everything except manage_roles).
  INSERT INTO roles (tenant_id, slug, name, description, is_system,
                     login_web, login_mobile)
  VALUES (p_tenant_id, 'admin', 'Admin',
          'Office manager. Can do anything except touch the Owner account or edit roles.',
          true, true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_admin_id;

  -- Telefonista: web+mobile, sales/contact subset, NO settings access.
  INSERT INTO roles (tenant_id, slug, name, description, is_system,
                     login_web, login_mobile)
  VALUES (p_tenant_id, 'telefonista', 'Telefonista',
          'Call agent. Edits prospects and schedules appointments. No Settings access.',
          true, true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_telefonista_id;

  -- Rufero: MOBILE only, very narrow set.
  INSERT INTO roles (tenant_id, slug, name, description, is_system,
                     login_web, login_mobile)
  VALUES (p_tenant_id, 'rufero', 'Rufero',
          'Field inspector. Mobile-only login. Sees only assigned prospects/appointments.',
          true, false, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_rufero_id;

  -- Admin privileges — broad set, omitting manage_roles + delete_users restraint.
  -- (delete_users is granted; the Owner-row guard is enforced in the server action.)
  INSERT INTO role_privileges (role_id, privilege_slug)
  SELECT v_admin_id, slug FROM privileges
   WHERE slug IN (
     'view_prospects','view_all_prospects','create_prospects','edit_prospects',
     'delete_prospects','assign_prospects','change_prospect_status','mark_dnc',
     'view_appointments','view_all_appointments','create_appointments','edit_appointments',
     'delete_appointments','assign_appointment_rufero','cancel_appointments',
     'reschedule_appointments','complete_appointments','mark_appointment_no_show',
     'manage_any_availability',
     'view_documents','generate_documents','upload_documents','download_documents',
     'sign_documents_as_company','delete_documents','manage_document_templates',
     'manage_company_signature',
     'use_softphone','send_sms','send_email','connect_google_account',
     'view_call_logs','view_sms_logs','view_email_logs',
     'view_notes','add_notes','view_activities',
     'access_settings','manage_phone_numbers','manage_notification_preferences',
     'manage_own_notifications','manage_users','delete_users','manage_tenant_settings',
     'view_analytics','export_analytics'
   )
  ON CONFLICT DO NOTHING;

  -- Telefonista privileges — contact/sales subset, NO settings, NO user mgmt.
  INSERT INTO role_privileges (role_id, privilege_slug)
  SELECT v_telefonista_id, slug FROM privileges
   WHERE slug IN (
     'view_prospects','view_all_prospects','create_prospects','edit_prospects',
     'change_prospect_status','mark_dnc',
     'view_appointments','view_all_appointments','create_appointments','edit_appointments',
     'cancel_appointments','reschedule_appointments',
     'view_documents','generate_documents','upload_documents','download_documents',
     'use_softphone','send_sms','send_email','connect_google_account',
     'view_call_logs','view_sms_logs','view_email_logs',
     'view_notes','add_notes',
     'manage_own_notifications'
   )
  ON CONFLICT DO NOTHING;

  -- Rufero privileges — field-only subset. View is gated further by RLS
  -- (assigned_to = self / rufero_id = self).
  INSERT INTO role_privileges (role_id, privilege_slug)
  SELECT v_rufero_id, slug FROM privileges
   WHERE slug IN (
     'view_prospects',
     'view_appointments','complete_appointments','mark_appointment_no_show',
     'manage_own_availability',
     'view_documents','download_documents',
     'view_notes','add_notes',
     'create_inspection_reports','edit_inspection_reports',
     'capture_inspection_photos','capture_homeowner_signature',
     'manage_own_notifications'
   )
  ON CONFLICT DO NOTHING;

  -- Owner gets is_super_role; no explicit grants needed, but stamp
  -- the cache so the UI shows the full enumerated set when rendering.
  -- (Cache is recomputed by the trigger after the inserts above.)
  PERFORM public.refresh_role_privileges_cache(v_owner_id);
  PERFORM public.refresh_role_privileges_cache(v_admin_id);
  PERFORM public.refresh_role_privileges_cache(v_telefonista_id);
  PERFORM public.refresh_role_privileges_cache(v_rufero_id);
END;
$$;

-- ------------------------------------------------------------
-- 5. SEED FOR EXISTING TENANTS + BACKFILL users.role_id
-- ------------------------------------------------------------
DO $$
DECLARE
  t_id uuid;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    PERFORM public.seed_default_roles(t_id);
  END LOOP;
END;
$$;

-- Map each existing user to the role row for their tenant + legacy slug.
-- super_admin users keep role_id NULL (no per-tenant row); the legacy
-- string column + the fallback in user_has_privilege() handles them.
UPDATE users u
   SET role_id = r.id
  FROM roles r
 WHERE r.tenant_id = u.tenant_id
   AND r.slug = u.role
   AND u.role <> 'super_admin';

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_privileges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_parents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE privileges       ENABLE ROW LEVEL SECURITY;

-- roles — readable by anyone in the tenant (so UI can display assignments);
-- mutated only by users with manage_roles privilege.
CREATE POLICY "roles_select" ON roles FOR SELECT USING (
  tenant_id = public.get_tenant_id() OR public.get_user_role() = 'super_admin'
);
CREATE POLICY "roles_insert" ON roles FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
  AND public.current_user_has_privilege('manage_roles')
);
CREATE POLICY "roles_update" ON roles FOR UPDATE USING (
  tenant_id = public.get_tenant_id()
  AND public.current_user_has_privilege('manage_roles')
);
CREATE POLICY "roles_delete" ON roles FOR DELETE USING (
  tenant_id = public.get_tenant_id()
  AND public.current_user_has_privilege('manage_roles')
  AND is_system = false
);

-- role_privileges — readable in tenant; mutated only with manage_roles.
CREATE POLICY "role_privileges_select" ON role_privileges FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_privileges.role_id
      AND (r.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'super_admin')
  )
);
CREATE POLICY "role_privileges_modify" ON role_privileges FOR ALL USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_privileges.role_id
      AND r.tenant_id = public.get_tenant_id()
  )
  AND public.current_user_has_privilege('manage_roles')
);

-- role_parents — same pattern.
CREATE POLICY "role_parents_select" ON role_parents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_parents.child_role_id
      AND (r.tenant_id = public.get_tenant_id() OR public.get_user_role() = 'super_admin')
  )
);
CREATE POLICY "role_parents_modify" ON role_parents FOR ALL USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_parents.child_role_id
      AND r.tenant_id = public.get_tenant_id()
  )
  AND public.current_user_has_privilege('manage_roles')
);

-- privileges — world-readable static catalog.
CREATE POLICY "privileges_select" ON privileges FOR SELECT USING (true);
