-- 033_m5_documents_type_upload.sql
--
-- Adds 'upload' to the allowed values for documents.type so that the
-- web "Upload PDF" flow (uploadDocument server action) can attach
-- existing PDFs to a prospect. Migration 032 widened the status check
-- to include 'uploaded' but missed the matching type widening.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_type_check
  CHECK (type IN ('3rd_party_auth', 'acv_contract', 'rcv_contract', 'supplement', 'upload'));
