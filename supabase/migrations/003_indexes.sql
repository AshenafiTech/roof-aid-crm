-- ============================================================
-- ROOF-AID CRM — Performance Indexes
-- ============================================================

-- Prospects: most queried table
CREATE INDEX idx_prospects_tenant_status    ON prospects(tenant_id, status);
CREATE INDEX idx_prospects_tenant_city      ON prospects(tenant_id, city);
CREATE INDEX idx_prospects_tenant_assignee  ON prospects(tenant_id, assigned_to);
CREATE INDEX idx_prospects_coords           ON prospects USING GIST(coordinates);
CREATE INDEX idx_prospects_tenant_created   ON prospects(tenant_id, created_at DESC);

-- Appointments
CREATE INDEX idx_appts_tenant_rufero    ON appointments(tenant_id, rufero_id);
CREATE INDEX idx_appts_scheduled        ON appointments(tenant_id, scheduled_at);
CREATE INDEX idx_appts_prospect         ON appointments(prospect_id);

-- Documents
CREATE INDEX idx_documents_prospect     ON documents(tenant_id, prospect_id);

-- Call logs
CREATE INDEX idx_call_logs_tenant       ON call_logs(tenant_id, created_at DESC);
CREATE INDEX idx_call_logs_prospect     ON call_logs(prospect_id);

-- SMS logs
CREATE INDEX idx_sms_logs_tenant        ON sms_logs(tenant_id, created_at DESC);

-- Email logs
CREATE INDEX idx_email_logs_tenant      ON email_logs(tenant_id, created_at DESC);

-- Activities
CREATE INDEX idx_activities_prospect    ON activities(tenant_id, prospect_id);
CREATE INDEX idx_activities_tenant      ON activities(tenant_id, created_at DESC);

-- Notes
CREATE INDEX idx_notes_prospect         ON notes(tenant_id, prospect_id);

-- Notifications
CREATE INDEX idx_notifs_user            ON notifications(user_id, is_read);

-- Users
CREATE INDEX idx_users_tenant           ON users(tenant_id);

-- Supplements
CREATE INDEX idx_supplements_prospect   ON supplements(tenant_id, prospect_id);

-- Commission transactions
CREATE INDEX idx_commissions_tenant     ON commission_transactions(tenant_id);

-- Inspection reports
CREATE INDEX idx_inspections_prospect   ON inspection_reports(tenant_id, prospect_id);
