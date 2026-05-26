-- ============================================================
-- ROOF-AID CRM — Milestone 5 follow-up
-- Extend prospects SELECT policy so ruferos can read prospects
-- they have an appointment for (not only prospects directly
-- assigned via prospects.assigned_to).
--
-- WHY:
--   When a Telefonista books an appointment for a rufero, the
--   appointment row is created with rufero_id = <rufero>, but the
--   prospect row's `assigned_to` may still be null (or a different
--   rufero). The old RLS only let a rufero see prospects where
--   `assigned_to = auth.uid()`, so mobile join-queries returned
--   null prospect data → the UI rendered "Unknown prospect".
--
--   Real-world workflow: the office assigns appointments, not
--   prospects. A rufero needs to read the prospect details
--   (address, phone) to actually do the job, regardless of the
--   prospects.assigned_to gate.
--
-- DESIGN:
--   Additive: keeps the existing `assigned_to = auth.uid()` path
--   AND adds an `EXISTS (appointments…)` clause. A rufero can read
--   a prospect iff:
--     - it's assigned to them directly, OR
--     - they have at least one appointment for it.
--   Other roles are unchanged.
-- ============================================================

DROP POLICY IF EXISTS "prospects_select" ON prospects;

CREATE POLICY "prospects_select" ON prospects FOR SELECT USING (
  tenant_id = public.get_tenant_id() AND (
    public.get_user_role() IN ('owner', 'admin', 'telefonista', 'super_admin')
    OR (
      public.get_user_role() = 'rufero' AND (
        assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a.prospect_id = prospects.id
            AND a.rufero_id = auth.uid()
        )
      )
    )
  )
);

-- Performance note: the EXISTS subquery is keyed on
-- (prospect_id, rufero_id). The existing index
-- `appointments_scheduled_range_gist (rufero_id, scheduled_range)`
-- doesn't cover this lookup. Add a small btree to keep RLS cheap.
CREATE INDEX IF NOT EXISTS appointments_rufero_prospect_idx
  ON appointments (rufero_id, prospect_id);
