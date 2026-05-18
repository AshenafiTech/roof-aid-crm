-- ============================================================
-- ROOF-AID CRM — Milestone 6
-- Allow `awaiting_homeowner_signature` as a documents.status value.
--
-- Two-party signing flow:
--   admin/owner signs first  → status = 'awaiting_homeowner_signature'
--   homeowner signs second   → status = 'signed'
--
-- Rufero gating is only triggered by status='signed', so the
-- intermediate state keeps the appointment flow unblocked.
-- ============================================================

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (
    status IS NULL OR status IN (
      'generated',
      'sent',
      'signed',
      'failed',
      'uploaded',
      'awaiting_homeowner_signature'
    )
  );
