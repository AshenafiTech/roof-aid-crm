-- ============================================================
-- ROOF-AID CRM — Milestone 6
-- Customizable document templates + telefonista edit audit log.
--
-- See docs/jir/document-templates-customization-plan.md
--
-- Design:
--   document_templates           — one logical template per (tenant, kind).
--   document_template_versions   — immutable, append-only content rows.
--   document_edits               — append-only diff per generated document.
--
-- Owner edits a template → new version row, optionally published (becomes
-- the active version). Telefonista edits at generation time write a
-- document_edits row + final_content snapshot on documents.template_data;
-- THEY NEVER MUTATE THE TEMPLATE.
-- ============================================================

-- ---------------------------------------------------------------
-- document_templates
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind               text NOT NULL,
  active_version_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_templates_kind_check
    CHECK (kind IN ('3rd_party_auth','acv_contract','rcv_contract','supplement')),
  CONSTRAINT document_templates_tenant_kind_uq
    UNIQUE (tenant_id, kind)
);

CREATE INDEX IF NOT EXISTS document_templates_tenant_idx
  ON document_templates (tenant_id);

-- ---------------------------------------------------------------
-- document_template_versions  (immutable)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_template_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_no         int  NOT NULL,
  content            jsonb NOT NULL,                  -- TipTap/ProseMirror doc
  title              text,                            -- optional header override
  variables          jsonb,                           -- [{token,label,required,type}]
  source             text NOT NULL DEFAULT 'editor',
  source_docx_path   text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,                     -- null = draft
  change_summary     text,
  CONSTRAINT document_template_versions_source_check
    CHECK (source IN ('editor','docx_import','hardcoded_default')),
  CONSTRAINT document_template_versions_template_no_uq
    UNIQUE (template_id, version_no)
);

CREATE INDEX IF NOT EXISTS document_template_versions_tenant_created_idx
  ON document_template_versions (tenant_id, template_id, created_at DESC);

-- Wire the FK from document_templates.active_version_id now that the
-- versions table exists.
ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_active_version_fk;
ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_active_version_fk
  FOREIGN KEY (active_version_id)
  REFERENCES document_template_versions(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- document_edits  (append-only per generated document)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_edits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id           uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  template_version_id   uuid REFERENCES document_template_versions(id) ON DELETE SET NULL,
  field_changes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_changes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_content         jsonb,
  edited_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_edits_document_idx
  ON document_edits (document_id);
CREATE INDEX IF NOT EXISTS document_edits_tenant_created_idx
  ON document_edits (tenant_id, created_at DESC);

-- ---------------------------------------------------------------
-- updated_at trigger for document_templates
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_document_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON document_templates;
CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_document_templates_updated_at();

-- ---------------------------------------------------------------
-- Auto-assign version_no within a template (monotonic).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_document_template_version_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_no int;
BEGIN
  IF NEW.version_no IS NULL OR NEW.version_no = 0 THEN
    SELECT COALESCE(MAX(version_no), 0) + 1
      INTO next_no
      FROM document_template_versions
      WHERE template_id = NEW.template_id;
    NEW.version_no := next_no;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_template_versions_version_no
  ON document_template_versions;
CREATE TRIGGER trg_document_template_versions_version_no
  BEFORE INSERT ON document_template_versions
  FOR EACH ROW
  EXECUTE FUNCTION assign_document_template_version_no();

-- ---------------------------------------------------------------
-- Seed one document_templates row per existing tenant for each kind.
-- Owners can publish a version; until then, the Edge Function falls
-- back to the hardcoded legal text.
-- ---------------------------------------------------------------
INSERT INTO document_templates (tenant_id, kind)
SELECT t.id, k.kind
FROM tenants t
CROSS JOIN (VALUES
  ('3rd_party_auth'),
  ('acv_contract'),
  ('rcv_contract'),
  ('supplement')
) AS k(kind)
ON CONFLICT (tenant_id, kind) DO NOTHING;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
ALTER TABLE document_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_edits             ENABLE ROW LEVEL SECURITY;

-- document_templates ------------------------------------------------
DROP POLICY IF EXISTS "doc_templates_select" ON document_templates;
CREATE POLICY "doc_templates_select" ON document_templates FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
DROP POLICY IF EXISTS "doc_templates_insert" ON document_templates;
CREATE POLICY "doc_templates_insert" ON document_templates FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);
DROP POLICY IF EXISTS "doc_templates_update" ON document_templates;
CREATE POLICY "doc_templates_update" ON document_templates FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);
DROP POLICY IF EXISTS "doc_templates_delete" ON document_templates;
CREATE POLICY "doc_templates_delete" ON document_templates FOR DELETE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);

-- document_template_versions ---------------------------------------
-- Reads open to any tenant member (telefonista needs the active version
-- to render the preview at generation time).
DROP POLICY IF EXISTS "doc_template_versions_select" ON document_template_versions;
CREATE POLICY "doc_template_versions_select"
  ON document_template_versions FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
DROP POLICY IF EXISTS "doc_template_versions_insert" ON document_template_versions;
CREATE POLICY "doc_template_versions_insert"
  ON document_template_versions FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);
-- Owners can flip publish status; content is immutable post-insert,
-- but we don't enforce that at the DB level — server code only
-- updates published_at.
DROP POLICY IF EXISTS "doc_template_versions_update" ON document_template_versions;
CREATE POLICY "doc_template_versions_update"
  ON document_template_versions FOR UPDATE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);
-- Allow owners to delete drafts; published versions should not be
-- removed (server code enforces).
DROP POLICY IF EXISTS "doc_template_versions_delete" ON document_template_versions;
CREATE POLICY "doc_template_versions_delete"
  ON document_template_versions FOR DELETE USING (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin')
);

-- document_edits ---------------------------------------------------
DROP POLICY IF EXISTS "doc_edits_select" ON document_edits;
CREATE POLICY "doc_edits_select" ON document_edits FOR SELECT USING (
  tenant_id = public.get_tenant_id()
);
DROP POLICY IF EXISTS "doc_edits_insert" ON document_edits;
CREATE POLICY "doc_edits_insert" ON document_edits FOR INSERT WITH CHECK (
  tenant_id = public.get_tenant_id() AND
  public.get_user_role() IN ('owner','admin','telefonista')
);
-- No UPDATE / DELETE policies — table is append-only.
