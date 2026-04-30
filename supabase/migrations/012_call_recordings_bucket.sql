-- ============================================================
-- ROOF-AID CRM — M4 Stage 1: call-recordings storage bucket
-- ============================================================
-- Private bucket. Path layout: {tenant_id}/{call_id}.mp3
-- A user can read recordings from their own tenant only.
-- Service role (Edge Functions) does the upload from Telnyx.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Read access — same shape as the inspection-photos / documents
-- buckets created in earlier milestones: tenant id is the first
-- path segment, must match the caller's tenant.
DROP POLICY IF EXISTS "call_recordings_tenant_select" ON storage.objects;
CREATE POLICY "call_recordings_tenant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE intentionally NOT granted to authenticated.
-- Recordings flow in from the Telnyx webhook → Edge Function → service
-- role upload only. Authenticated users never write here directly.


