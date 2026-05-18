-- ============================================================
-- ROOF-AID CRM — Milestone 5 Step 4
-- Storage buckets for documents, signatures, and inspection photos.
-- All three are private and tenant-isolated by path prefix:
--   documents/{tenant_id}/...
--   signatures/{tenant_id}/...
--   inspection-photos/{tenant_id}/...
-- Mirrors the M4 call-recordings pattern (012_storage_call_recordings.sql).
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents',         'documents',         false),
  ('signatures',        'signatures',        false),
  ('inspection-photos', 'inspection-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- documents bucket
-- ============================================================
DROP POLICY IF EXISTS "documents_tenant_select" ON storage.objects;
CREATE POLICY "documents_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "documents_tenant_insert" ON storage.objects;
CREATE POLICY "documents_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "documents_tenant_update" ON storage.objects;
CREATE POLICY "documents_tenant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "documents_tenant_delete" ON storage.objects;
CREATE POLICY "documents_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

-- ============================================================
-- signatures bucket
-- ============================================================
DROP POLICY IF EXISTS "signatures_tenant_select" ON storage.objects;
CREATE POLICY "signatures_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "signatures_tenant_insert" ON storage.objects;
CREATE POLICY "signatures_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "signatures_tenant_delete" ON storage.objects;
CREATE POLICY "signatures_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

-- ============================================================
-- inspection-photos bucket (used by mobile Stage 7)
-- ============================================================
DROP POLICY IF EXISTS "inspection_photos_tenant_select" ON storage.objects;
CREATE POLICY "inspection_photos_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "inspection_photos_tenant_insert" ON storage.objects;
CREATE POLICY "inspection_photos_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inspection-photos'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "inspection_photos_tenant_update" ON storage.objects;
CREATE POLICY "inspection_photos_tenant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "inspection_photos_tenant_delete" ON storage.objects;
CREATE POLICY "inspection_photos_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND (storage.foldername(name))[1] = public.get_tenant_id()::text
  );
