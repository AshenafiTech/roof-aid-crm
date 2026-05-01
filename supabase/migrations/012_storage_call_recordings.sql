-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: call-recordings storage bucket
-- Private bucket scoped per-tenant via path prefix:
-- call-recordings/{tenant_id}/{call_id}.mp3
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Tenant-isolated access: first path segment must equal caller's tenant_id

DROP POLICY IF EXISTS "call_recordings_tenant_select" ON storage.objects;
CREATE POLICY "call_recordings_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "call_recordings_tenant_insert" ON storage.objects;
CREATE POLICY "call_recordings_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "call_recordings_tenant_update" ON storage.objects;
CREATE POLICY "call_recordings_tenant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "call_recordings_tenant_delete" ON storage.objects;
CREATE POLICY "call_recordings_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );
