-- ============================================================
-- ROOF-AID CRM — Seed Users
-- Links existing auth.users rows to public.users and sets JWT
-- metadata (tenant_id, role) required by RLS helper functions.
--
-- Pre-req: both auth users must already exist (created via
-- Supabase dashboard / sign-up). This script fails loudly if not.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_auth_id uuid;
  v_tenant_nwa   constant uuid := '11111111-1111-1111-1111-111111111111';
  v_tenant_ozark constant uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- ------------------------------------------------------------
  -- User 1 — jirudagutema@gmail.com → NWA Roofing Co (owner)
  -- ------------------------------------------------------------
  SELECT id INTO v_auth_id FROM auth.users WHERE email = 'jirudagutema@gmail.com';
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth.users row for jirudagutema@gmail.com not found. Create it via the Supabase dashboard (Authentication → Users → Add user) and re-run this migration.';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', v_tenant_nwa::text,
        'role', 'owner'
      )
  WHERE id = v_auth_id;

  INSERT INTO public.users (id, tenant_id, email, first_name, last_name, role, is_active)
  VALUES (v_auth_id, v_tenant_nwa, 'jirudagutema@gmail.com', 'Jiru', 'Gutema', 'owner', true)
  ON CONFLICT (id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        role      = EXCLUDED.role,
        email     = EXCLUDED.email,
        is_active = true;

  -- ------------------------------------------------------------
  -- User 2 — jethior1@gmail.com → Ozark Roofing Co (owner)
  -- ------------------------------------------------------------
  SELECT id INTO v_auth_id FROM auth.users WHERE email = 'jethior1@gmail.com';
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth.users row for jethior1@gmail.com not found. Create it via the Supabase dashboard (Authentication → Users → Add user) and re-run this migration.';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', v_tenant_ozark::text,
        'role', 'owner'
      )
  WHERE id = v_auth_id;

  INSERT INTO public.users (id, tenant_id, email, first_name, last_name, role, is_active)
  VALUES (v_auth_id, v_tenant_ozark, 'jethior1@gmail.com', 'Jethior', 'Demo', 'owner', true)
  ON CONFLICT (id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        role      = EXCLUDED.role,
        email     = EXCLUDED.email,
        is_active = true;
END $$;

COMMIT;
