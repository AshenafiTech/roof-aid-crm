-- ============================================================
-- ROOF-AID CRM — Auth Helper Functions (public schema)
-- These use auth.jwt() which is available from public schema
-- ============================================================

-- Read tenant_id from JWT claims
CREATE OR REPLACE FUNCTION public.get_tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Read role from JWT claims
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
