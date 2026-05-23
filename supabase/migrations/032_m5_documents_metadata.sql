-- ============================================================
-- ROOF-AID CRM — Milestone 5 Stage 4
-- documents metadata: SHA-256, page count, template payload, signature
-- audit metadata. Strictly additive over the M1 documents schema.
-- See docs/milestone5/stage-4-pdf-generation.md §3.
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sha256             text,
  ADD COLUMN IF NOT EXISTS signed_sha256      text,
  ADD COLUMN IF NOT EXISTS page_count         int,
  ADD COLUMN IF NOT EXISTS template_data      jsonb,
  ADD COLUMN IF NOT EXISTS signature_metadata jsonb,
  ADD COLUMN IF NOT EXISTS email_status       text,
  ADD COLUMN IF NOT EXISTS email_sent_at      timestamptz;

CREATE INDEX IF NOT EXISTS documents_prospect_created_idx
  ON documents (prospect_id, created_at DESC);

-- Status now includes 'uploaded' for direct PDF uploads (Stage 5).
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IS NULL OR status IN ('generated','sent','signed','failed','uploaded'));

-- Realtime publication so the prospect's Documents tab + the global
-- Documents page can live-update when a generation finishes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
  END IF;
END $$;
