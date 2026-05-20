-- ============================================================
-- ROOF-AID CRM — Milestone 6
-- Per-tenant stored "company representative" signature.
--
-- When set, every newly-generated document is automatically signed
-- on the {Tenant} Representative line at generation time, leaving
-- only the homeowner signature for the customer to add.
--
-- The PNG itself lives in the `signatures` bucket at
--   signatures/{tenant_id}/company-signature.png
-- and `tenants.company_signature_path` holds that path so we can
-- detect "is a company signature configured?" in O(1).
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS company_signature_path       text,
  ADD COLUMN IF NOT EXISTS company_signature_signer     text,
  ADD COLUMN IF NOT EXISTS company_signature_updated_at timestamptz;
