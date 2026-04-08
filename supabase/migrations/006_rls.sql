-- ============================================================
-- ROOF-AID CRM — Row Level Security Policies
-- Uses public.get_tenant_id() and public.get_user_role()
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tenants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_reports     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TENANTS: own row or super_admin
-- ============================================================
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (
  id = public.get_tenant_id() OR public.get_user_role() = 'super_admin'
);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (
  public.get_user_role() = 'super_admin'
);
CREATE POLICY "tenants_insert" ON tenants FOR INSERT WITH CHECK (
  public.get_user_role() = 'super_admin'
);
CREATE POLICY "tenants_delete" ON tenants FOR DELETE USING (
  public.get_user_role() = 'super_admin'
);

-- ============================================================
-- USERS: same tenant; management by admin+
-- ============================================================
CREATE POLICY "users_select" ON users FOR SELECT USING (
  tenant_id = public.get_tenant_id() OR public.get_user_role() = 'super_admin'
);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('super_admin', 'owner')
);
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND (
    id = auth.uid() OR public.get_user_role() IN ('admin', 'owner', 'super_admin')
  )
);
CREATE POLICY "users_delete" ON users FOR DELETE USING (
  public.get_user_role() IN ('owner', 'super_admin')
);

-- ============================================================
-- PROSPECTS: rufero sees only assigned records
-- ============================================================
CREATE POLICY "prospects_select" ON prospects FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND (
    public.get_user_role() IN ('owner', 'admin', 'telefonista') OR
    (public.get_user_role() = 'rufero' AND assigned_to = auth.uid())
  )
);
CREATE POLICY "prospects_insert" ON prospects FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "prospects_update" ON prospects FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "prospects_delete" ON prospects FOR DELETE USING (
  tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin')
);

-- ============================================================
-- APPOINTMENTS: rufero sees only own appointments
-- ============================================================
CREATE POLICY "appts_select" ON appointments FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND (
    public.get_user_role() IN ('owner', 'admin', 'telefonista') OR
    (public.get_user_role() = 'rufero' AND rufero_id = auth.uid())
  )
);
CREATE POLICY "appts_insert" ON appointments FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "appts_update" ON appointments FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "appts_delete" ON appointments FOR DELETE USING (
  tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin')
);

-- ============================================================
-- DOCUMENTS: same tenant, role-based access
-- ============================================================
CREATE POLICY "documents_select" ON documents FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "documents_update" ON documents FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'telefonista')
);
CREATE POLICY "documents_delete" ON documents FOR DELETE USING (
  tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin')
);

-- ============================================================
-- CALL LOGS: same tenant
-- ============================================================
CREATE POLICY "call_logs_select" ON call_logs FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
CREATE POLICY "call_logs_insert" ON call_logs FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
);

-- ============================================================
-- SMS LOGS: same tenant
-- ============================================================
CREATE POLICY "sms_logs_select" ON sms_logs FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
CREATE POLICY "sms_logs_insert" ON sms_logs FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
);

-- ============================================================
-- EMAIL LOGS: same tenant
-- ============================================================
CREATE POLICY "email_logs_select" ON email_logs FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
CREATE POLICY "email_logs_insert" ON email_logs FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
);

-- ============================================================
-- ACTIVITIES: read by admin+, insert by service role only
-- ============================================================
CREATE POLICY "activities_select" ON activities FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin')
);

-- ============================================================
-- NOTES: same tenant
-- ============================================================
CREATE POLICY "notes_select" ON notes FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
CREATE POLICY "notes_insert" ON notes FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
);

-- ============================================================
-- NOTIFICATIONS: user sees only their own
-- ============================================================
CREATE POLICY "notifs_select" ON notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "notifs_update" ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- ============================================================
-- PLATFORM CONFIG: super_admin only
-- ============================================================
CREATE POLICY "platform_config_select" ON platform_config FOR SELECT USING (
  public.get_user_role() = 'super_admin'
);
CREATE POLICY "platform_config_modify" ON platform_config FOR ALL USING (
  public.get_user_role() = 'super_admin'
);

-- ============================================================
-- SUPPLEMENTS: same tenant, role-based
-- ============================================================
CREATE POLICY "supplements_select" ON supplements FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin')
);
CREATE POLICY "supplements_insert" ON supplements FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin')
);
CREATE POLICY "supplements_update" ON supplements FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin')
);

-- ============================================================
-- COMMISSION TRANSACTIONS: super_admin only
-- ============================================================
CREATE POLICY "commission_select" ON commission_transactions FOR SELECT USING (
  public.get_user_role() = 'super_admin'
);
CREATE POLICY "commission_modify" ON commission_transactions FOR ALL USING (
  public.get_user_role() = 'super_admin'
);

-- ============================================================
-- INSPECTION REPORTS: same tenant, rufero sees own
-- ============================================================
CREATE POLICY "inspections_select" ON inspection_reports FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND (
    public.get_user_role() IN ('owner', 'admin') OR
    (public.get_user_role() = 'rufero' AND rufero_id = auth.uid())
  )
);
CREATE POLICY "inspections_insert" ON inspection_reports FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'rufero')
);
CREATE POLICY "inspections_update" ON inspection_reports FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner', 'admin', 'rufero')
);
