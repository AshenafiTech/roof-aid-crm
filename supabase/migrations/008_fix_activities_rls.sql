-- ============================================================
-- FIX: Activities RLS policies
-- Problem: No INSERT policy existed (server actions fail),
--          SELECT locked out telefonista (should see own activities)
-- ============================================================

-- Drop the broken SELECT policy
DROP POLICY IF EXISTS "activities_select" ON activities;

-- Recreate SELECT: owner/admin see all tenant activities,
-- telefonista sees only their own, rufero sees none
CREATE POLICY "activities_select" ON activities FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND (
    public.get_user_role() IN ('owner', 'admin', 'super_admin') OR
    (public.get_user_role() = 'telefonista' AND user_id = auth.uid())
  )
);

-- Add INSERT policy: all authenticated users within the tenant can log activities
CREATE POLICY "activities_insert" ON activities FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id()
);
