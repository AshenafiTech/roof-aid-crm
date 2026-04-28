-- ============================================================
-- NOTES: author-only UPDATE/DELETE inside a 15-minute window
-- ============================================================
-- Notes are an audit trail of what happened at the door, so they stay
-- append-only after 15 minutes. Before that the author gets a short
-- window to fix typos or remove a misfired note. Tenant-scope is still
-- enforced so a user can't reach into another tenant's notes even with
-- a valid session.

CREATE POLICY "notes_update" ON notes FOR UPDATE
USING (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
  AND created_at > now() - interval '15 minutes'
)
WITH CHECK (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
);

CREATE POLICY "notes_delete" ON notes FOR DELETE
USING (
  tenant_id = public.get_tenant_id()
  AND author_id = auth.uid()
  AND created_at > now() - interval '15 minutes'
);
