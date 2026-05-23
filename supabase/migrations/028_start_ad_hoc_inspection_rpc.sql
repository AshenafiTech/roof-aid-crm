-- ============================================================
-- ROOF-AID CRM — Milestone 5 follow-up
-- start_ad_hoc_inspection(prospect_id) RPC
--
-- Used by the mobile "Inspect Now" button on the prospect detail
-- page (Stage 7 Option B follow-up — docs/milestone5/stage-7-mobile-inspection.md).
--
-- The rufero is on-site at a prospect that doesn't have a confirmed
-- appointment scheduled for *right now* (walk-in lead, ad-hoc check,
-- etc.). Rather than have them ask the office to back-fill an
-- appointment, they tap "Inspect Now" and we create one for them
-- with status='confirmed' and scheduled_at=now(). The inspection
-- then proceeds identically to the appointment-driven flow — same
-- inspection_reports row, same photos, same signed PDF pipeline.
--
-- Returns the new appointment id so the mobile client can pass it
-- straight to InspectionPage.
-- ============================================================

CREATE OR REPLACE FUNCTION start_ad_hoc_inspection(
  p_prospect_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text := public.get_user_role();
  v_caller_tenant  uuid := public.get_tenant_id();
  v_uid            uuid := auth.uid();
  v_prospect_tenant uuid;
  v_prospect_assigned uuid;
  v_appt_id        uuid;
  v_inspection_id  uuid;
BEGIN
  -- 1. Only ruferos do inspections.
  IF v_role <> 'rufero' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object(
        'code','forbidden',
        'message','Only field inspectors can start an inspection.'));
  END IF;

  -- 2. Prospect must exist in caller's tenant.
  SELECT tenant_id, assigned_to
    INTO v_prospect_tenant, v_prospect_assigned
  FROM prospects
  WHERE id = p_prospect_id;

  IF v_prospect_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','Prospect not found.'));
  END IF;

  IF v_prospect_tenant <> v_caller_tenant THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Cross-tenant access denied.'));
  END IF;

  -- 3. Prospect must be assigned to *this* rufero, OR unassigned (in
  -- which case the ad-hoc inspection claims them).
  IF v_prospect_assigned IS NOT NULL AND v_prospect_assigned <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object(
        'code','not_assigned',
        'message','This prospect is assigned to another rufero.'));
  END IF;

  -- 4. If there's already a confirmed appointment for this rufero +
  -- prospect within ±2h of now, reuse it instead of creating a duplicate.
  SELECT id INTO v_appt_id
  FROM appointments
  WHERE rufero_id = v_uid
    AND prospect_id = p_prospect_id
    AND status IN ('pending','confirmed')
    AND scheduled_at BETWEEN now() - interval '2 hours' AND now() + interval '2 hours'
  ORDER BY scheduled_at
  LIMIT 1;

  IF v_appt_id IS NULL THEN
    -- 5a. Create the appointment. Confirmed + scheduled_at=now() so the
    -- inspection-page gate `canStartInspection` (status=confirmed AND
    -- within ±2h) passes immediately on mobile.
    INSERT INTO appointments (
      tenant_id, prospect_id, rufero_id, scheduled_at, duration_minutes,
      status, notes, created_by
    ) VALUES (
      v_caller_tenant, p_prospect_id, v_uid, now(), 60,
      'confirmed', 'Ad-hoc inspection started from prospect detail.', v_uid
    )
    RETURNING id INTO v_appt_id;

    -- Claim the prospect if it was unassigned.
    IF v_prospect_assigned IS NULL THEN
      UPDATE prospects SET assigned_to = v_uid, updated_at = now()
      WHERE id = p_prospect_id;
    END IF;

    -- 6. Log to activities (non-fatal).
    BEGIN
      INSERT INTO activities (tenant_id, prospect_id, user_id, type, metadata)
      VALUES (
        v_caller_tenant, p_prospect_id, v_uid,
        'ad_hoc_inspection_started',
        jsonb_build_object('appointment_id', v_appt_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 7. Get-or-create the inspection_reports row so the client can land
  -- straight on the inspection page without an extra round-trip.
  SELECT id INTO v_inspection_id
  FROM inspection_reports
  WHERE appointment_id = v_appt_id
  LIMIT 1;

  IF v_inspection_id IS NULL THEN
    INSERT INTO inspection_reports (
      tenant_id, prospect_id, appointment_id, rufero_id,
      affected_areas, photo_count_expected
    ) VALUES (
      v_caller_tenant, p_prospect_id, v_appt_id, v_uid,
      ARRAY[]::text[], 0
    )
    RETURNING id INTO v_inspection_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'inspection_id', v_inspection_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION start_ad_hoc_inspection(uuid) TO authenticated;
