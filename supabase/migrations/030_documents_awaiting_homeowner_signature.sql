-- ============================================================
-- ROOF-AID CRM — Milestone 5 follow-up
-- Add `awaiting_homeowner_signature` to documents.status so the
-- two-party signing workflow (company first, then homeowner)
-- doesn't collide with the existing "signed = done" semantic.
--
-- WHY:
--   A 3rd Party Authorization (and most other contract templates)
--   carries TWO signature blocks: company owner + homeowner. The
--   web app collects the company signature; mobile collects the
--   homeowner signature on-site.
--
--   The old constraint allowed only ('generated','sent','signed').
--   When the web flipped a company-signed doc to status='signed',
--   mobile saw "fully signed" and refused to open the signature
--   pad — even though the homeowner half was still missing.
--
-- NEW LIFECYCLE:
--   generated                     ← `generate-pdf` creates the row
--      ↓ (web: company-owner signs)
--   awaiting_homeowner_signature  ← THIS migration adds it
--      ↓ (mobile: `embed-signature` on the homeowner sig)
--   signed                        ← both parties done
--
--   `sent` is unchanged — emailed copy lifecycle, independent of
--   the signing chain. `failed` and `uploaded` are included so
--   pre-existing rows that drifted outside the original constraint
--   (production data, scripted backfills, etc.) pass through.
--
-- WEB-SIDE COORDINATION (required for this to work end-to-end):
--   The web's company-signature flow must set the doc to
--   'awaiting_homeowner_signature' instead of 'signed'. Suggested:
--   add a `signer_role` body field to `embed-signature` —
--     - 'company'   → status = 'awaiting_homeowner_signature'
--     - 'homeowner' (or omitted, mobile default) → status = 'signed'
--   Mobile always omits the field, so existing mobile calls keep
--   producing 'signed' rows as they do today.
-- ============================================================

-- 1. Drop the auto-named CHECK constraint that 002_core_tables
-- created when the table was first declared. Postgres named it
-- `documents_status_check` by default. The DO block makes this
-- migration idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_status_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_status_check;
  END IF;
END $$;

-- 2. Recreate with the new value alongside the existing ones.
--
-- NOT VALID skips validation of pre-existing rows — production may
-- have rows that drifted outside the original constraint (for
-- example, the previous CHECK was probably dropped or relaxed at
-- some point: the failure that triggered this migration revision
-- proves some row holds a value outside {generated,sent,signed}).
-- New INSERTs and UPDATEs are still validated by Postgres.
--
-- Once the bad rows are cleaned up (or audited and accepted),
-- you can promote the constraint to fully-validated with:
--   ALTER TABLE documents VALIDATE CONSTRAINT documents_status_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN (
    'generated',                       -- no signatures yet
    'sent',                             -- emailed to homeowner; signing status independent
    'awaiting_homeowner_signature',    -- company signed, homeowner pending  (NEW)
    'signed',                           -- both parties done
    'failed',                           -- generation failed
    'uploaded'                          -- manual upload (no template render)
  )) NOT VALID;

-- 3. Helper view to surface the rows that don't match the new
-- constraint, so an admin can decide whether to backfill or leave
-- them alone before running VALIDATE CONSTRAINT later.
-- Self-contained — drops cleanly when the cleanup is done.
CREATE OR REPLACE VIEW documents_with_invalid_status AS
SELECT id, tenant_id, prospect_id, type, status, created_at
FROM documents
WHERE status IS NULL
   OR status NOT IN (
     'generated', 'sent', 'awaiting_homeowner_signature',
     'signed', 'failed', 'uploaded'
   );

COMMENT ON VIEW documents_with_invalid_status IS
  'Rows whose status is outside the allowed set after migration 030. '
  'Inspect, backfill, then run: '
  'ALTER TABLE documents VALIDATE CONSTRAINT documents_status_check;';
