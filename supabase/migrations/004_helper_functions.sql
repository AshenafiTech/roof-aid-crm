-- ============================================================
-- ROOF-AID CRM — Helper Functions
-- NOTE: auth.tenant_id() and auth.user_role() must be created
--       via Supabase Dashboard → SQL Editor (see 004b below)
-- ============================================================

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
